// Add other global types here if needed

// Define ChatMessage interface for shared use
export interface ChatMessage {
  id: number;
  roomId: number;
  senderId: number;
  content: string;
  messageType: string;
  sentAt: string; // ISO string
  sender: {
    id: number;
    display_name: string;
    avatar: string | null;
    is_online: boolean;
  };
  reactions: {
    userId: number;
    reaction: string;
    userDisplayName: string;
  }[];
  readBy: {
    userId: number;
    readAt: string; // ISO string
    userDisplayName: string;
  }[];
  replyToMessage: {
    id: number;
    content: string;
    sender: { id: number; display_name: string };
  } | null;
  sharedAttackLog: {
    id: number;
    attacker_id: number;
    defender_id: number;
    winner: number;
    timestamp: string | null; // ISO string
  } | null;
  isOptimistic?: boolean;
  tempId?: number;
}

// You might also want to define FrontendRoom here
export interface FrontendRoom {
  id: number;
  name: string | null;
  isPrivate: boolean;
  isDirect: boolean;
  createdById: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastMessage: string | null;
  lastMessageTime: string | null; // ISO string
  lastMessageSender: string | null;
  unreadCount: number;
  isAdmin: boolean;
  participants: {
    id: number;
    role: "ADMIN" | "MEMBER";
    canWrite: boolean;
    display_name: string;
    avatar: string | null;
    is_online: boolean;
  }[];
}

// Add other shared types/interfaces below