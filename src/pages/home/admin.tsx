import React, { useState, useCallback, useEffect } from "react";
import Alert from "@/components/alert";
import {
  Text,
  Grid,
  Divider,
  Title,
  Modal  // Add Modal import
} from "@mantine/core";
import { PermissionType } from '@prisma/client';
import PermissionCheck from "@/components/PermissionCheck";
import GrantUserForm from "@/components/GrantUserForm";
import MainArea from "@/components/MainArea";
import UserSearchFilter from "@/components/UserSearchFilter";
import UserList from "@/components/UserList";
import UserAdminEditor from "@/components/UserAdminEditor";  // Import our new component

// Update the UserSummary interface
interface UserSummary {
  id: string;
  username: string;
  email: string;
  status: string;
  lastActive?: Date | string;
  permissions?: string[];
}

const Admin = (props) => {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Add state for managing the edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSearch = useCallback(async (filters: Record<string, string> = {}) => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('limit', '10');
      queryParams.append('offset', ((page - 1) * 10).toString());
      queryParams.append('sort', sortBy);
      queryParams.append('order', sortOrder);

      if (filters.id) queryParams.append('id', filters.id);
      if (filters.username) queryParams.append('username', filters.username);
      if (filters.email) queryParams.append('email', filters.email);
      if (filters.status) queryParams.append('status', filters.status);

      const response = await fetch(`/api/admin/users?${queryParams.toString()}`);
      const data = await response.json();
      setUsers(data.users || []);
      setTotalPages(Math.ceil((data.total || 0) / 10));
    } catch (error) {
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, sortBy, sortOrder]);

  useEffect(() => {
    handleSearch({});
  }, [sortBy, sortOrder, page]);

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  // Handler for when the edit button is clicked in the list
  const handleEditUser = useCallback((userId: string) => {
    console.log("Edit user requested:", userId);
    setSelectedUserId(userId);
    setEditModalOpen(true);
  }, []);

  // Close the modal and clear selected user
  const handleCloseModal = useCallback(() => {
    setEditModalOpen(false);
    setSelectedUserId(null);
  }, []);

  // Handle after a user is saved - refresh the user list
  const handleUserSaved = useCallback(() => {
    // Refetch users with the current filters
    handleSearch({});
  }, [handleSearch]);

  return (
    <MainArea title="Admin Panel">
      <PermissionCheck permission={PermissionType.ADMINISTRATOR}>
        <Grid gutter="lg">
          {/* Section 1: Grant Permissions */}
          <Grid.Col span={12}>
             <Title order={3} mb="sm">Grant Permissions</Title>
             <GrantUserForm />
          </Grid.Col>

          <Grid.Col span={12}>
            <Divider my="lg" />
          </Grid.Col>

          {/* Section 2: User Management */}
          <Grid.Col span={12}>
            <Title order={3} mb="sm">User Management</Title>
            <UserSearchFilter onSearch={handleSearch} />
            <UserList
              users={users}
              onEditUser={handleEditUser}
              isLoading={isLoading}
              page={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
            />
          </Grid.Col>
        </Grid>
        
        {/* User Edit Modal */}
        <Modal
          opened={editModalOpen}
          onClose={handleCloseModal}
          size="xl"
          title=""
          padding="md"
          fullScreen
        >
          {selectedUserId && (
            <UserAdminEditor
              userId={selectedUserId}
              onClose={handleCloseModal}
              onSaved={handleUserSaved}
            />
          )}
        </Modal>
      </PermissionCheck>
    </MainArea>
  );
};

export default Admin;
