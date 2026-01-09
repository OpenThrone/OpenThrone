import React, { useState, useCallback, useEffect } from "react";
import { Modal, Grid } from "@mantine/core";
import { PermissionType } from '@prisma/client';
import PermissionCheck from "@/components/PermissionCheck";
import GrantUserForm from "@/components/GrantUserForm";
import UserSearchFilter from "@/components/UserSearchFilter";
import UserList from "@/components/UserList";
import UserAdminEditor from "@/components/UserAdminEditor";
import { GameCard } from "@/components/game/GameCard";
import { faUsersCog, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import MainArea from "@/components/MainArea";

interface UserSummary {
  id: string;
  username: string;
  email: string;
  status: string;
  lastActive?: Date | string;
  permissions?: string[];
}

const Admin = () => {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSearch = useCallback(async (filters: Record<string, string> = {}) => {
    setIsLoading(true);
    const params = new URLSearchParams({
      limit: '10',
      offset: ((page - 1) * 10).toString(),
      sort: sortBy,
      order: sortOrder,
      ...filters
    });
    try {
      const response = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await response.json();
      setUsers(data.users || []);
      setTotalPages(Math.ceil((data.total || 0) / 10));
    } catch (error) {
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, sortBy, sortOrder]);

  useEffect(() => { handleSearch({}); }, [handleSearch]);

  const handleSortChange = (field: string) => {
    setSortBy(field);
    setSortOrder(sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc');
    setPage(1);
  };

  const handleEditUser = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setEditModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setEditModalOpen(false);
    setSelectedUserId(null);
  }, []);

  return (
    <PermissionCheck permission={PermissionType.ADMINISTRATOR}>
      <MainArea title="Admin">
        <Grid>
          <Grid.Col span={12}>
            <GameCard title="Grant Permissions" icon={faUserPlus}><GrantUserForm /></GameCard>
          </Grid.Col>
          <Grid.Col span={12}>
            <GameCard title="User Management" icon={faUsersCog}>
              <UserSearchFilter onSearch={handleSearch} />
              <UserList
                users={users}
                onEditUser={handleEditUser}
                isLoading={isLoading}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
              />
            </GameCard>
          </Grid.Col>
        </Grid>
        <Modal opened={editModalOpen} onClose={handleCloseModal} size="xl" title="Edit User">
          {selectedUserId && <UserAdminEditor userId={selectedUserId} onClose={handleCloseModal} onSaved={handleSearch} />}
        </Modal>
      </MainArea>
    </PermissionCheck>
  );
};

export default Admin;
