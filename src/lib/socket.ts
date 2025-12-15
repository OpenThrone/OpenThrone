import { AccountService } from "@/services";
import { AuthService } from "@/services";
import { BattleService } from "@/services";
import { ArmoryService } from "@/services";
import { SocialService } from "@/services/Social.service";
import {
  deposit,
  withdraw,
  getDepositHistory,
  getBankHistory,
} from "@/services/Bank.service";
import { UserDataService } from "@/services/UserDataService";
import {
  createSession,
  endSession,
  listSessions,
  validateSession,
  getSession,
  updateSessionActivity,
} from "@/services/Sessions.service";
import {
  performRecruitmentWithSessionValidation,
  getUserByRecruitLink,
  getRecruitmentRecords,
  getRandomAutoRecruitUser,
  getValidUsersForRecruitment,
} from "@/services/Recruitment.service";
import { MessagingService } from "@/services/Messaging.service";
import {
  trainUnits,
  untrainUnits,
  convertUnits,
} from "@/services/Training.service";
import { StructureService } from "@/services/Structure.service";
import { BlogService } from "@/services/Blog.service";
import { GeneralService } from "@/services/General.service";
import { AdminService } from "@/services/Admin.service";
import { startNewEra } from "@/services/Era.service";
import { CronJobService } from "@/services/CronJob.service";
import { parseBigInt } from "@/utils/jsonHelpers";
import UserModel from "@/models/Users";
import { safeToISOString } from "@/utils/dateHelpers";
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import prisma from "./prisma";
import { getToken } from "next-auth/jwt";
import cookie from "cookie";
import md5 from "md5";
import argon2 from "argon2";
import { logError, logInfo } from "@/utils/logger";
import { Prisma } from "@prisma/client"; // Added for types
import { rateLimiter } from "./rate-limiter";
import mtrand from "@/utils/mtrand";
import { getIpAddress } from "@/utils/ipUtils";
import { getOTStartDate } from "@/utils/timefunctions";
import { logAction } from "@/utils/auditLogger";
import { RecruitSchema } from "@/lib/validation";

let io: Server | null = null;
// Store mapping of userId to a Set of socketIds
const userSockets = new Map<number, Set<string>>();

// --- Event Handlers ---
const handleConnection = (socket: Socket) => {
  const userId: number | undefined = (socket.request as any).userId;

  if (userId === undefined) {
    logError("Socket connected without userId. Disconnecting.");
    socket.disconnect(true);
    return;
  }

  socket.join(`user-${userId}`);

  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)?.add(socket.id);

  // Register event handlers
  socket.on("requestUserData", () => handleRequestUserData(socket, userId));
  socket.on("sendMessage", (data) => handleSendMessage(socket, userId, data));
  socket.on("joinRoom", (roomId) => handleJoinRoom(socket, userId, roomId));
  socket.on("leaveRoom", (roomId) => handleLeaveRoom(socket, userId, roomId));
  socket.on("addReaction", (data) => handleAddReaction(socket, userId, data));
  socket.on("removeReaction", (data) =>
    handleRemoveReaction(socket, userId, data),
  );
  socket.on("markAsRead", (data) => handleMarkAsRead(socket, userId, data));
  socket.on("getChatRooms", () => handleGetChatRooms(socket, userId));
  socket.on("createChatRoom", (data) =>
    handleCreateChatRoom(socket, userId, data),
  );
  socket.on("getRoomMessages", (data) =>
    handleGetRoomMessages(socket, userId, data),
  );
  socket.on("addParticipants", (data) =>
    handleAddParticipants(socket, userId, data),
  );
  socket.on("manageParticipant", (data) =>
    handleManageParticipant(socket, userId, data),
  );
  socket.on("removeParticipant", (data) =>
    handleRemoveParticipant(socket, userId, data),
  );
  socket.on("searchMessages", (data) =>
    handleSearchMessages(socket, userId, data),
  );
  socket.on("trainUnits", (data) => handleTrainUnits(socket, userId, data));
  socket.on("untrainUnits", (data) => handleUntrainUnits(socket, userId, data));
  socket.on("convertUnits", (data) => handleConvertUnits(socket, userId, data));
  socket.on("manageStructureUpgrades", (data) =>
    handleManageStructureUpgrades(socket, userId, data),
  );
  socket.on("manageBattleUpgrades", (data) =>
    handleManageBattleUpgrades(socket, userId, data),
  );
  socket.on("createBlogPost", (data) =>
    handleCreateBlogPost(socket, userId, data),
  );
  socket.on("getBlogPosts", () => handleGetBlogPosts(socket, userId));
  socket.on("getRecentBlogPosts", () =>
    handleGetRecentBlogPosts(socket, userId),
  );
  socket.on("updateBlogReadStatus", (data) =>
    handleUpdateBlogReadStatus(socket, userId, data),
  );
  socket.on("getLatestUnreadBlogPost", () =>
    handleGetLatestUnreadBlogPost(socket, userId),
  );
  socket.on("getUserData", () => handleGetUserData(socket, userId));
  socket.on("searchUsers", (data) => handleSearchUsers(socket, userId, data));
  socket.on("checkDisplayName", (data) =>
    handleCheckDisplayName(socket, userId, data),
  );
  socket.on("getOnlinePlayers", () => handleGetOnlinePlayers(socket, userId));
  socket.on("compareTop", () => handleCompareTop(socket, userId));
  socket.on("resetGame", () => handleResetGame(socket, userId));
  socket.on("revalidate", () => handleRevalidate(socket, userId));
  socket.on("getUserBreakdown", () => handleGetUserBreakdown(socket, userId));
  socket.on("getUserStats", () => handleGetUserStats(socket, userId));
  socket.on("getUserInfoByRecruitLink", (data) =>
    handleGetUserInfoByRecruitLink(socket, userId, data),
  );
  socket.on("updateBio", (data) => handleUpdateBio(socket, userId, data));
  socket.on("updateProfile", (data) =>
    handleUpdateProfile(socket, userId, data),
  );
  socket.on("changePassword", (data) =>
    handleChangePassword(socket, userId, data),
  );
  socket.on("updateSettings", (data) =>
    handleUpdateSettings(socket, userId, data),
  );
  socket.on("updateEmail", (data) => handleUpdateEmail(socket, userId, data));
  socket.on("enable2FA", () => handleEnable2FA(socket, userId));
  socket.on("disable2FA", () => handleDisable2FA(socket, userId));
  socket.on("verify2FA", (data) => handleVerify2FA(socket, userId, data));
  socket.on("startVacation", () => handleStartVacation(socket, userId));
  socket.on("endVacation", () => handleEndVacation(socket, userId));
  socket.on("repairAccount", (data) =>
    handleRepairAccount(socket, userId, data),
  );
  socket.on("resetAccount", (data) => handleResetAccount(socket, userId, data));
  socket.on("updateLastActive", () => handleUpdateLastActive(socket, userId));
  socket.on("executeAttack", (data) =>
    handleExecuteAttack(socket, userId, data),
  );
  socket.on("getAttackLogs", (data) =>
    handleGetAttackLogs(socket, userId, data),
  );
  socket.on("getRecentAttacks", () => handleGetRecentAttacks(socket, userId));
  socket.on("grantAttackLogACL", (data) =>
    handleGrantAttackLogACL(socket, userId, data),
  );
  socket.on("battleTest", (data) => handleBattleTest(socket, userId, data));
  socket.on("fullScaleBattleTest", (data) =>
    handleFullScaleBattleTest(socket, userId, data),
  );
  socket.on("retestAttack", (data) => handleRetestAttack(socket, userId, data));
  socket.on("depositGold", (data) => handleDepositGold(socket, userId, data));
  socket.on("withdrawGold", (data) => handleWithdrawGold(socket, userId, data));
  socket.on("getDeposits", () => handleGetDeposits(socket, userId));
  socket.on("getBankHistory", (data) =>
    handleGetBankHistory(socket, userId, data),
  );
  socket.on("equipItem", (data) => handleEquipItem(socket, userId, data));
  socket.on("unequipItem", (data) => handleUnequipItem(socket, userId, data));
  socket.on("hireMercenary", (data) =>
    handleHireMercenary(socket, userId, data),
  );
  socket.on("dismissMercenary", (data) =>
    handleDismissMercenary(socket, userId, data),
  );
  socket.on("convertItem", (data) => handleConvertItem(socket, userId, data));
  socket.on("addFriend", (data) => handleAddFriend(socket, userId, data));
  socket.on("removeFriend", (data) => handleRemoveFriend(socket, userId, data));
  socket.on("respondToFriendRequest", (data) =>
    handleRespondToFriendRequest(socket, userId, data),
  );
  socket.on("getFriends", () => handleGetFriends(socket, userId));
  socket.on("transferGold", (data) => handleTransferGold(socket, userId, data));
  socket.on("sendGoldRequest", (data) =>
    handleSendGoldRequest(socket, userId, data),
  );
  socket.on("respondToGoldRequest", (data) =>
    handleRespondToGoldRequest(socket, userId, data),
  );
  socket.on("getGoldRequests", () => handleGetGoldRequests(socket, userId));
  socket.on("getSocialRelationships", () =>
    handleGetSocialRelationships(socket, userId),
  );
  socket.on("getTopPlayers", () => handleGetTopPlayers(socket, userId));
  socket.on("listAllSocial", () => handleListAllSocial(socket, userId));
  socket.on("startRecruitSession", (data) =>
    handleStartRecruitSession(socket, userId, data),
  );
  socket.on("endRecruitSession", (data) =>
    handleEndRecruitSession(socket, userId, data),
  );
  socket.on("listRecruitSessions", () =>
    handleListRecruitSessions(socket, userId),
  );
  socket.on("verifyRecruitSession", (data) =>
    handleVerifyRecruitSession(socket, userId, data),
  );
  socket.on("handleRecruitment", (data) =>
    handleRecruitment(socket, userId, data),
  );
  socket.on("getRecruitHistory", () => handleGetRecruitHistory(socket, userId));
  socket.on("autoRecruit", () => handleAutoRecruit(socket, userId));
  socket.on("getRandomRecruitUser", (data) =>
    handleGetRandomRecruitUser(socket, userId, data),
  );
  socket.on("notifyAttack", handleNotifyAttack);
  socket.on("notifyFriendRequest", handleNotifyFriendRequest);
  socket.on("notifyEnemyDeclaration", handleNotifyEnemyDeclaration);
  socket.on("notifyGoldRequest", handleNotifyGoldRequest);
  socket.on("alertNotification", handleAlertNotification);
  socket.on("ping", handlePing);
  socket.on("adminAccountAction", (data) =>
    handleAdminAccountAction(socket, userId, data),
  );
  socket.on("grantPermission", (data) =>
    handleGrantPermission(socket, userId, data),
  );
  socket.on("startEra", () => handleStartEra(socket, userId));
  socket.on("getConstants", () => handleGetConstants(socket, userId));
  socket.on("getRankBreakdown", () => handleGetRankBreakdown(socket, userId));
  socket.on("dailyCron", (data) => handleDailyCron(socket, userId, data));
  socket.on("turnsCron", (data) => handleTurnsCron(socket, userId, data));
  socket.on("accountStatusCron", (data) =>
    handleAccountStatusCron(socket, userId, data),
  );
  socket.on("verifyCaptcha", (data) =>
    handleVerifyCaptcha(socket, userId, data),
  );
  socket.on("disconnect", (reason) => handleDisconnect(socket, userId, reason));
};

// Helper to serialize potentially complex message objects including BigInts and Dates
const serializeData = (data: any): any => {
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (value instanceof Date) {
        return safeToISOString(value);
      }
      return value;
    }),
  );
};

// Define the payload type for messages including relations
type MessageWithRelationsPayload = Prisma.ChatMessageGetPayload<{
  include: {
    sender: {
      select: { id: true; display_name: true; avatar: true; last_active: true };
    };
    replyToMessage: {
      select: {
        id: true;
        content: true;
        sender: { select: { id: true; display_name: true } };
      };
    };
    sharedAttackLog: {
      select: {
        id: true;
        attacker_id: true;
        defender_id: true;
        winner: true;
        timestamp: true;
      };
    };
    reactions: {
      select: {
        userId: true;
        reaction: true;
        user: { select: { id: true; display_name: true } };
      };
    };
    readBy: {
      select: {
        userId: true;
        readAt: true;
        user: { select: { id: true; display_name: true } };
      };
    };
    // Add other shared log includes here if needed
  };
}>;

export const initializeSocket = (httpServer: HttpServer) => {
  if (io) {
    logInfo("Socket.IO already initialized");
    return io;
  }

  logInfo("Initializing Socket.IO...");
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_SOCKET_IO_ORIGIN || "*", // More permissive for dev if needed
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/socket.io",
    allowRequest: async (req, callback) => {
      try {
        const cookies = cookie.parse(req.headers.cookie || "");
        const sessionTokenCookie =
          cookies["next-auth.session-token"] ||
          cookies["__Secure-next-auth.session-token"];

        if (!sessionTokenCookie) {
          return callback("No session token", false);
        }

        const minimalReq = {
          headers: req.headers,
          cookies: {
            "next-auth.session-token": sessionTokenCookie,
            "__Secure-next-auth.session-token": sessionTokenCookie,
          },
        };

        const token: any = await getToken({
          req: minimalReq as any,
          secret: process.env.JWT_SECRET,
        });

        if (!token || !(token.user && token.user.id)) {
          logInfo("Socket Auth: Invalid or missing token/user ID");
          return callback("Invalid token", false);
        }

        (req as any).userId = Number(token.user.id);
        logInfo(`Socket Auth: User ${token.user.id} authorized.`);
        callback(null, true);
      } catch (err: any) {
        logInfo("Socket Auth Error:", err.message);
        return callback("Authentication error", false);
      }
    },
  });

  io.on("connection", handleConnection);

  logInfo("Socket.IO initialized successfully");
  return io;
};

const handleRequestUserData = async (socket: Socket, userId: number) => {
  if (isNaN(userId)) {
    logError("Invalid userId:", userId);
    return;
  }
  try {
    // Use the new UserDataService to get all user data
    const userData = await UserDataService.getFullUserData(userId);

    if (!userData) {
      socket.emit("userDataError", { error: "User not found" });
      return;
    }

    // Handle VACATION status separately as the service throws for other statuses
    if (userData.currentStatus === "VACATION") {
      socket.emit(
        "userVacation",
        serializeData({ ...userData, currentStatus: userData.currentStatus }),
      );
      return;
    }

    // The DTO is already constructed by the service, so we can send it directly.
    // We still need to normalize dates for the socket.
    const normalizedUserData = {
      ...userData,
      last_active: safeToISOString(userData.last_active),
    };

    socket.emit("userData", serializeData(normalizedUserData));
  } catch (error) {
    logError("Socket || Error fetching user data:", error);
    // Handle the specific error thrown by the service for banned/suspended users
    if (error instanceof Error && error.message.includes("Account is in")) {
      socket.emit("userDataError", { error: error.message });
    } else {
      socket.emit("userDataError", {
        error: "Internal server error while fetching user data.",
      });
    }
  }
};

const handleSendMessage = async (
  socket: Socket,
  userId: number,
  data: {
    roomId: number;
    content: string;
    tempId?: number;
    replyToMessageId?: number;
    messageType?: string;
    sharedAttackLogId?: number;
  },
) => {
  if (!rateLimiter(`sendMessage-${userId}`, { windowMs: 10000, max: 10 })) {
    socket.emit("messageError", {
      tempId: data.tempId,
      error: "You are sending messages too quickly.",
    });
    return;
  }
  const {
    roomId,
    content,
    replyToMessageId,
    messageType = "TEXT",
    sharedAttackLogId,
  } = data;
  logInfo(
    `sendMessage event received for room ${roomId} from user ${userId}`,
    data,
  );

  if (!roomId || !content || userId === undefined) {
    logInfo("sendMessage failed: Missing required data or userId");
    socket.emit("messageError", {
      tempId: data.tempId,
      error: "Invalid message data",
    });
    return;
  }

  try {
    // 1. Verify participant and permissions
    const participant = await prisma.chatRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: Number(roomId), userId: userId } },
      include: { room: { select: { allianceId: true } } },
    });

    if (!participant || !participant.canWrite) {
      logInfo(
        `sendMessage failed: User ${userId} cannot write or not in room ${roomId}`,
      );
      socket.emit("messageError", {
        tempId: data.tempId,
        error: "Cannot send message in this room.",
      });
      return;
    }

    // 1b. Alliance room check
    if (participant.room.allianceId) {
      const membership = await prisma.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: {
            alliance_id: participant.room.allianceId,
            user_id: userId,
          },
        },
      });
      if (!membership) {
        logInfo(
          `sendMessage failed: User ${userId} not member of alliance ${participant.room.allianceId}`,
        );
        socket.emit("messageError", {
          tempId: data.tempId,
          error: "Not an alliance member.",
        });
        return;
      }
    }

    // 2. Validate ReplyToMessageId
    let validReplyToId: number | null = null;
    if (replyToMessageId) {
      const repliedTo = await prisma.chatMessage.findUnique({
        where: { id: replyToMessageId, roomId: Number(roomId) },
      });
      if (!repliedTo) {
        logInfo(
          `sendMessage failed: replyToMessageId ${replyToMessageId} invalid`,
        );
        socket.emit("messageError", {
          tempId: data.tempId,
          error: "Cannot reply to this message.",
        });
        return;
      }
      validReplyToId = repliedTo.id;
    }

    // 3. Validate Shared Log ID and Permissions
    let validSharedAttackLogId: number | null = null;
    if (messageType === "ATTACK_LOG_SHARE" && sharedAttackLogId) {
      const log = await prisma.attack_log.findUnique({
        where: { id: sharedAttackLogId },
        select: {
          id: true,
          attacker_id: true,
          defender_id: true,
          acl: {
            select: {
              shared_with_user_id: true,
              shared_with_alliance_id: true,
            },
          },
        },
      });
      if (!log) {
        socket.emit("messageError", {
          tempId: data.tempId,
          error: "Attack log not found.",
        });
        return;
      }
      // Check Permissions
      const canShare = await checkLogSharePermission(userId, log);
      if (!canShare) {
        socket.emit("messageError", {
          tempId: data.tempId,
          error: "No permission to share this log.",
        });
        return;
      }
      validSharedAttackLogId = log.id;
      logInfo(
        `User ${userId} has permission to share attack log ${sharedAttackLogId}`,
      );
    } else if (messageType !== "TEXT") {
      socket.emit("messageError", {
        tempId: data.tempId,
        error: "Unsupported message type.",
      });
      return;
    }

    // 4. Create the message in the database
    const newMessage = await prisma.chatMessage.create({
      data: {
        roomId: Number(roomId),
        senderId: userId,
        content: content,
        messageType: messageType,
        replyToMessageId: validReplyToId,
        sharedAttackLogId: validSharedAttackLogId,
      },
      include: {
        // Include all necessary relations for broadcast payload
        sender: {
          select: {
            id: true,
            display_name: true,
            avatar: true,
            last_active: true,
          },
        },
        replyToMessage: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, display_name: true } },
          },
        },
        sharedAttackLog: {
          select: {
            id: true,
            attacker_id: true,
            defender_id: true,
            winner: true,
            timestamp: true,
          },
        },
        reactions: {
          select: {
            userId: true,
            reaction: true,
            user: { select: { id: true, display_name: true } },
          },
        },
        readBy: {
          select: {
            userId: true,
            readAt: true,
            user: { select: { id: true, display_name: true } },
          },
        },
      },
    });

    // 5. Update room timestamp
    await prisma.chatRoom.update({
      where: { id: Number(roomId) },
      data: { updatedAt: new Date() },
    });

    // 6. Grant ACL access if sharing a log
    if (
      newMessage.messageType === "ATTACK_LOG_SHARE" &&
      newMessage.sharedAttackLogId
    ) {
      await grantAclToParticipants(
        newMessage.sharedAttackLogId,
        Number(roomId),
        userId,
      );
    }

    // 7. Prepare and Broadcast Payload
    const messagePayload = {
      ...serializeData(newMessage),
      tempId: data.tempId,
    };
    const roomChannel = `room-${roomId}`;

    // Log sockets before emitting
    const socketsInRoom = await io!.in(roomChannel).fetchSockets();
    logInfo(
      `<<< SERVER >>> Sockets currently in ${roomChannel} before emit:`,
      socketsInRoom.map((s) => `${s.id} (User: ${findUserIdBySocketId(s.id)})`),
    );

    io!.to(roomChannel).emit("receiveMessage", messagePayload);
    logInfo(`<<< SERVER >>> Emitted 'receiveMessage' to ${roomChannel}`);

    // 8. Emit Notifications
    await sendNotifications(Number(roomId), userId, newMessage);
  } catch (error) {
    logError(`Error handling sendMessage for room ${roomId}:`, error);
    socket.emit("messageError", {
      tempId: data.tempId,
      error: "Failed to send message.",
    });
  }
};

const handleJoinRoom = async (socket: Socket, userId: number, roomId: any) => {
  const numericRoomId = Number(roomId);
  if (isNaN(numericRoomId)) {
    logError(
      `<<< SERVER >>> Invalid roomId for joinRoom from Socket ${socket.id}: ${roomId}`,
    );
    socket.emit("joinRoomError", {
      roomId: roomId,
      error: "Invalid room ID format.",
    });
    return;
  }

  try {
    const room = await prisma.chatRoom.findUnique({
      where: { id: numericRoomId },
      select: { id: true, allianceId: true },
    });

    if (!room) {
      logError(
        `<<< SERVER >>> Room ${numericRoomId} not found for joinRoom User ${userId}`,
      );
      socket.emit("joinRoomError", {
        roomId: numericRoomId,
        error: "Room not found.",
      });
      return;
    }

    // Alliance room check
    if (room.allianceId) {
      const membership = await prisma.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: {
            alliance_id: room.allianceId,
            user_id: userId,
          },
        },
      });
      if (!membership) {
        logInfo(
          `<<< SERVER >>> User ${userId} denied joining alliance room ${numericRoomId}`,
        );
        socket.emit("joinRoomError", {
          roomId: numericRoomId,
          error: "You are not a member of the alliance for this chat.",
        });
        return;
      }
    }

    const roomChannel = `room-${numericRoomId}`;
    socket.join(roomChannel);
    // Confirm join and check adapter rooms
    const adapterRooms = io!.sockets.adapter.rooms.get(roomChannel);
    logInfo(
      `<<< SERVER >>> Socket ${socket.id} (User ${userId}) attempted join on ${roomChannel}. Sockets in room now: ${adapterRooms ? Array.from(adapterRooms) : "None"}`,
    );
    socket.emit("joinedRoom", { roomId: numericRoomId });
  } catch (error) {
    logError(
      `<<< SERVER >>> Error during joinRoom User ${userId}, Room ${numericRoomId}:`,
      error,
    );
    socket.emit("joinRoomError", {
      roomId: numericRoomId,
      error: "Server error joining room.",
    });
  }
};

const handleLeaveRoom = (socket: Socket, userId: number, roomId: any) => {
  if (
    typeof roomId === "number" ||
    (typeof roomId === "string" && !isNaN(Number(roomId)))
  ) {
    const roomChannel = `room-${Number(roomId)}`;
    socket.leave(roomChannel);
    logInfo(
      `<<< SERVER >>> Socket ${socket.id} (User ${userId}) left ${roomChannel}`,
    );
  } else {
    logError(
      `<<< SERVER >>> Invalid roomId for leaveRoom from Socket ${socket.id}: ${roomId}`,
    );
  }
};

const handleAddReaction = async (
  socket: Socket,
  userId: number,
  data: { messageId: number; reaction: string; roomId: number },
) => {
  if (!rateLimiter(`addReaction-${userId}`, { windowMs: 10000, max: 20 })) {
    socket.emit("reactionError", {
      messageId: data.messageId,
      error: "You are reacting too quickly.",
    });
    return;
  }
  const { messageId, reaction, roomId } = data;
  logInfo(
    `addReaction event: msg ${messageId}, reaction ${reaction}, room ${roomId}, user ${userId}`,
  );

  if (!messageId || !reaction || !roomId || userId === undefined) {
    socket.emit("reactionError", {
      messageId,
      reaction,
      error: "Invalid reaction data.",
    });
    return;
  }

  try {
    // Verify user is in the room & message exists
    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        roomId: Number(roomId),
        room: { participants: { some: { userId: userId } } },
      },
      select: { id: true },
    });
    if (!message) {
      logInfo(
        `addReaction failed: Message ${messageId} not found in room ${roomId} or user ${userId} not participant.`,
      );
      socket.emit("reactionError", {
        messageId,
        reaction,
        error: "Message not found or you are not in this room.",
      });
      return;
    }

    // Create reaction
    const newReaction = await prisma.chatMessageReaction.create({
      data: { messageId: messageId, userId: userId, reaction: reaction },
      select: {
        messageId: true,
        userId: true,
        reaction: true,
        user: { select: { id: true, display_name: true } },
      },
    });

    // Broadcast
    const reactionPayload = {
      messageId: newReaction.messageId,
      userId: newReaction.userId,
      reaction: newReaction.reaction,
      userDisplayName: newReaction.user.display_name,
    };
    io!.to(`room-${roomId}`).emit("reactionAdded", reactionPayload);
    logInfo(`Emitted 'reactionAdded' to room-${roomId}`, reactionPayload);
  } catch (error: any) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      logInfo(
        `addReaction failed: User ${userId} already reacted with ${reaction} on msg ${messageId}`,
      );
      socket.emit("reactionError", {
        messageId,
        reaction,
        error: "You already added this reaction.",
      });
    } else {
      logError(`Error handling addReaction for msg ${messageId}:`, error);
      socket.emit("reactionError", {
        messageId,
        reaction,
        error: "Failed to add reaction.",
      });
    }
  }
};

const handleRemoveReaction = async (
  socket: Socket,
  userId: number,
  data: { messageId: number; reaction: string; roomId: number },
) => {
  const { messageId, reaction, roomId } = data;
  logInfo(
    `removeReaction event: msg ${messageId}, reaction ${reaction}, room ${roomId}, user ${userId}`,
  );

  if (!messageId || !reaction || !roomId || userId === undefined) {
    socket.emit("reactionError", {
      messageId,
      reaction,
      error: "Invalid reaction data.",
    });
    return;
  }

  try {
    // Verify user is in the room (implicit check via deleteMany condition)
    const deleteResult = await prisma.chatMessageReaction.deleteMany({
      where: {
        messageId: messageId,
        userId: userId,
        reaction: reaction,
        message: { roomId: Number(roomId) },
      },
    });

    if (deleteResult.count > 0) {
      const reactionPayload = {
        messageId: messageId,
        userId: userId,
        reaction: reaction,
      };
      io!.to(`room-${roomId}`).emit("reactionRemoved", reactionPayload);
      logInfo(`Emitted 'reactionRemoved' to room-${roomId}`, reactionPayload);
    } else {
      logInfo(
        `removeReaction: Reaction not found or not owned by user ${userId}`,
      );
    }
  } catch (error) {
    logError(`Error handling removeReaction for msg ${messageId}:`, error);
    socket.emit("reactionError", {
      messageId,
      reaction,
      error: "Failed to remove reaction.",
    });
  }
};

const handleMarkAsRead = async (
  socket: Socket,
  userId: number,
  data:
    | { messageId: number; roomId: number }
    | { messageIds: number[]; roomId: number },
) => {
  const { roomId } = data;
  const messageIds = "messageId" in data ? [data.messageId] : data.messageIds;
  logInfo(
    `markAsRead event: msgs ${messageIds.join(", ")}, room ${roomId}, user ${userId}`,
  );

  if (
    !roomId ||
    !messageIds ||
    messageIds.length === 0 ||
    userId === undefined
  ) {
    return;
  }

  try {
    // Verify user is in the room
    const participant = await prisma.chatRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: Number(roomId), userId: userId } },
      select: { userId: true },
    });
    if (!participant) {
      logInfo(`markAsRead ignored: User ${userId} not in room ${roomId}`);
      return;
    }

    // Upsert read status
    const upsertPromises = messageIds.map((msgId) =>
      prisma.chatMessageReadStatus.upsert({
        where: { messageId_userId: { messageId: msgId, userId: userId } },
        update: {
          /* readAt updates automatically via @updatedAt */
        },
        create: { messageId: msgId, userId: userId },
        select: { messageId: true, userId: true, readAt: true },
      }),
    );
    const results = await Promise.all(upsertPromises);

    // Broadcast read status update
    const readPayloads = results.map((r) => ({
      messageId: r.messageId,
      userId: r.userId,
      readAt: safeToISOString(r.readAt),
    }));

    if (readPayloads.length > 0) {
      io!.to(`room-${roomId}`).emit("messagesRead", {
        roomId: Number(roomId),
        updates: readPayloads,
      });
      logInfo(`Emitted 'messagesRead' to room-${roomId}`, {
        count: readPayloads.length,
      });
    }
  } catch (error) {
    logError(`Error handling markAsRead for room ${roomId}:`, error);
  }
};

const handleUpdateBio = async (
  socket: Socket,
  userId: number,
  data: { bio: string },
) => {
  try {
    const { bio } = data;
    const result = await AccountService.updateBio(userId, bio);
    socket.emit("updateBioSuccess", serializeData(result));
  } catch (error) {
    logError("Error updating bio:", error);
    socket.emit("updateBioError", { error: "Error updating bio" });
  }
};

const handleUpdateProfile = async (
  socket: Socket,
  userId: number,
  data: { bio?: string; avatarFile?: string },
) => {
  try {
    const { bio, avatarFile } = data;
    let updateData: any = {};

    if (bio !== undefined) {
      updateData.bio = bio;
    }

    if (avatarFile !== undefined) {
      updateData.avatarFile = avatarFile;
    }

    if (Object.keys(updateData).length === 0) {
      socket.emit("updateProfileError", { error: "No data to update" });
      return;
    }

    const result = await AccountService.updateProfile(userId, updateData);
    socket.emit("updateProfileSuccess", serializeData(result));
  } catch (error) {
    logError("Error updating profile:", error);
    socket.emit("updateProfileError", { error: "Error updating profile" });
  }
};

const handleChangePassword = async (
  socket: Socket,
  userId: number,
  data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
) => {
  try {
    const result = await AccountService.changePassword(userId, data);
    socket.emit("changePasswordSuccess", serializeData(result));
  } catch (error) {
    logError("Error changing password:", error);
    socket.emit("changePasswordError", {
      error: error.message || "Error changing password",
    });
  }
};

const handleUpdateSettings = async (
  socket: Socket,
  userId: number,
  data: { locale?: string; colorScheme?: string },
) => {
  try {
    const { locale, colorScheme } = data;
    let updateData: any = {};

    if (locale) {
      updateData.locale = locale;
    }

    if (colorScheme) {
      updateData.colorScheme = colorScheme;
    }

    if (Object.keys(updateData).length === 0) {
      socket.emit("updateSettingsError", { error: "No data to update" });
      return;
    }

    const result = await AccountService.updateGameOptions(userId, updateData);
    socket.emit("updateSettingsSuccess", serializeData(result));
  } catch (error) {
    logError("Error updating settings:", error);
    socket.emit("updateSettingsError", {
      error: error.message || "Error updating settings",
    });
  }
};

const handleUpdateEmail = async (
  socket: Socket,
  userId: number,
  data: { newEmail: string; password: string; verify: string },
) => {
  try {
    const { newEmail, password, verify } = data;

    await prisma.$transaction(async (tx) => {
      // 1. Check if the new email is already in use by another user
      const existingUserWithNewEmail = await tx.users.findUnique({
        where: { email: newEmail },
        select: { id: true },
      });

      if (existingUserWithNewEmail && existingUserWithNewEmail.id !== userId) {
        throw new Error("Email is already in use by another account.");
      }

      // 2. Find the valid verification code for this user
      const verificationRecord = await tx.passwordReset.findFirst({
        where: {
          userId: userId,
          verificationCode: verify,
          status: 0,
          type: "EMAIL",
        },
      });

      if (!verificationRecord) {
        throw new Error("Invalid or expired verification code.");
      }

      // 3. Verify the user's current password
      const currentUser = await tx.users.findUnique({
        where: { id: userId },
        select: { password_hash: true },
      });

      if (!currentUser || !currentUser.password_hash) {
        throw new Error("User account not found or password hash missing.");
      }

      const passwordMatch = await argon2.verify(
        currentUser.password_hash,
        password,
      );
      if (!passwordMatch) {
        throw new Error("Invalid password.");
      }

      // 4. Update the user's email
      await tx.users.update({
        where: { id: userId },
        data: { email: newEmail },
      });

      // 5. Mark the verification code as used
      await tx.passwordReset.update({
        where: { id: verificationRecord.id },
        data: { status: 1 },
      });
    });

    socket.emit("updateEmailSuccess", {
      message: "Email updated successfully.",
    });
  } catch (error: any) {
    logError("Error updating email:", error);
    socket.emit("updateEmailError", {
      error: error.message || "Error updating email",
    });
  }
};

const handleEnable2FA = async (socket: Socket, userId: number) => {
  try {
    // Need display name for 2FA
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { display_name: true },
    });
    if (!user) {
      socket.emit("enable2FAError", { error: "User not found" });
      return;
    }
    const result = await AuthService.enable2FA(userId, user.display_name);
    socket.emit("enable2FASuccess", serializeData(result));
  } catch (error: any) {
    logError("Error enabling 2FA:", error);
    socket.emit("enable2FAError", {
      error: error.message || "Error enabling 2FA",
    });
  }
};

const handleDisable2FA = async (socket: Socket, userId: number) => {
  try {
    const result = await AuthService.disable2FA(userId);
    socket.emit("disable2FASuccess", serializeData(result));
  } catch (error: any) {
    logError("Error disabling 2FA:", error);
    socket.emit("disable2FAError", {
      error: error.message || "Error disabling 2FA",
    });
  }
};

const handleVerify2FA = async (
  socket: Socket,
  userId: number,
  data: { token: string },
) => {
  try {
    const { token } = data;
    const result = await AuthService.verify2FA(userId, token);
    socket.emit("verify2FASuccess", serializeData(result));
  } catch (error: any) {
    logError("Error verifying 2FA:", error);
    socket.emit("verify2FAError", {
      error: error.message || "Error verifying 2FA",
    });
  }
};

const handleStartVacation = async (socket: Socket, userId: number) => {
  try {
    const result = await AccountService.startVacation(userId);
    socket.emit("startVacationSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error starting vacation:", error);
    socket.emit("startVacationError", {
      error: error.message || "Error starting vacation",
    });
  }
};

const handleEndVacation = async (socket: Socket, userId: number) => {
  try {
    const result = await AccountService.endVacation(userId);
    socket.emit("endVacationSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error ending vacation:", error);
    socket.emit("endVacationError", {
      error: error.message || "Error ending vacation",
    });
  }
};

const handleRepairAccount = async (
  socket: Socket,
  userId: number,
  data: { repairPoints: number },
) => {
  try {
    const result = await AccountService.repairFortification(userId, data);
    socket.emit("repairAccountSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error repairing account:", error);
    socket.emit("repairAccountError", {
      error: error.message || "Error repairing account",
    });
  }
};

const handleResetAccount = async (
  socket: Socket,
  userId: number,
  data: { password: string },
) => {
  try {
    const result = await AccountService.resetAccount(userId, data);
    socket.emit("resetAccountSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error resetting account:", error);
    socket.emit("resetAccountError", {
      error: error.message || "Error resetting account",
    });
  }
};

const handleUpdateLastActive = async (socket: Socket, userId: number) => {
  try {
    const result = await AccountService.updateLastActive({ userId });
    socket.emit("updateLastActiveSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error updating last active:", error);
    socket.emit("updateLastActiveError", {
      error: error.message || "Error updating last active",
    });
  }
};

const handleExecuteAttack = async (
  socket: Socket,
  userId: number,
  data: { defenderId: number; turns: number },
) => {
  try {
    const { defenderId, turns } = data;
    const result = await BattleService.executeAttack({
      attackerId: userId,
      defenderId,
      attackTurns: turns,
    });
    socket.emit("executeAttackSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error executing attack:", error);
    socket.emit("executeAttackError", {
      error: error.message || "Error executing attack",
    });
  }
};

const handleGetAttackLogs = async (
  socket: Socket,
  userId: number,
  data: {
    page?: number;
    limit?: number;
    player?: string;
    minPillage?: number;
    maxPillage?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  },
) => {
  try {
    const result = await BattleService.getAttackLogs(userId, data);
    socket.emit("getAttackLogsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting attack logs:", error);
    socket.emit("getAttackLogsError", {
      error: error.message || "Error getting attack logs",
    });
  }
};

const handleGetRecentAttacks = async (socket: Socket, userId: number) => {
  try {
    const result = await BattleService.getRecentAttacks({ timeWindow: 7 });
    socket.emit("getRecentAttacksSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting recent attacks:", error);
    socket.emit("getRecentAttacksError", {
      error: error.message || "Error getting recent attacks",
    });
  }
};

const handleGrantAttackLogACL = async (
  socket: Socket,
  userId: number,
  data: { attackLogId: number; roomId: number; participantIds?: number[] },
) => {
  try {
    const { attackLogId, roomId, participantIds } = data;
    const result = await BattleService.manageAttackLogACL(attackLogId, {
      userId,
      roomId,
      participantIds,
    });
    socket.emit("grantAttackLogACLSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error granting attack log ACL:", error);
    socket.emit("grantAttackLogACLError", {
      error: error.message || "Error granting attack log ACL",
    });
  }
};

const handleBattleTest = async (
  socket: Socket,
  userId: number,
  data: { defenderId: number; attackerId?: number },
) => {
  try {
    const { defenderId, attackerId } = data;
    // Allow admins to specify different attacker
    const actualAttackerId =
      (userId === 1 || userId === 2) && attackerId ? attackerId : userId;
    const result = await BattleService.simulateBattle({
      attackerId: actualAttackerId,
      defenderId,
      turns: 10,
    });
    socket.emit("battleTestSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error running battle test:", error);
    socket.emit("battleTestError", {
      error: error.message || "Error running battle test",
    });
  }
};

const handleFullScaleBattleTest = async (
  socket: Socket,
  userId: number,
  data: { attackerId?: number },
) => {
  try {
    // Only admins can run full scale battle test
    if (userId !== 1 && userId !== 2) {
      socket.emit("fullScaleBattleTestError", { error: "Unauthorized" });
      return;
    }
    const { attackerId } = data;
    const result = await BattleService.fullScaleBattleTest(attackerId);
    socket.emit("fullScaleBattleTestSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error running full scale battle test:", error);
    socket.emit("fullScaleBattleTestError", {
      error: error.message || "Error running full scale battle test",
    });
  }
};

const handleRetestAttack = async (
  socket: Socket,
  userId: number,
  data: { attackLogId: number },
) => {
  try {
    const { attackLogId } = data;
    const result = await BattleService.retestBattle(attackLogId);
    socket.emit("retestAttackSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error retesting attack:", error);
    socket.emit("retestAttackError", {
      error: error.message || "Error retesting attack",
    });
  }
};

const handleDepositGold = async (
  socket: Socket,
  userId: number,
  data: { depositAmount: string | number },
) => {
  try {
    const depositAmount = parseBigInt(data.depositAmount);
    if (depositAmount === null || depositAmount <= 0) {
      socket.emit("depositGoldError", { error: "Invalid deposit amount" });
      return;
    }

    const history = await getDepositHistory(userId);
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      socket.emit("depositGoldError", { error: "User not found" });
      return;
    }

    const uModel = new UserModel(user);
    if (uModel.maximumBankDeposits - history.length <= 0) {
      socket.emit("depositGoldError", { error: "Maximum deposits reached" });
      return;
    }

    const result = await deposit(userId, depositAmount);
    socket.emit("depositGoldSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error depositing gold:", error);
    socket.emit("depositGoldError", {
      error: error.message || "Error depositing gold",
    });
  }
};

const handleWithdrawGold = async (
  socket: Socket,
  userId: number,
  data: { withdrawAmount: string | number },
) => {
  try {
    const withdrawAmount = parseBigInt(data.withdrawAmount);
    if (withdrawAmount === null || withdrawAmount <= 0) {
      socket.emit("withdrawGoldError", { error: "Invalid withdraw amount" });
      return;
    }

    const result = await withdraw(userId, withdrawAmount);
    socket.emit("withdrawGoldSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error withdrawing gold:", error);
    socket.emit("withdrawGoldError", {
      error: error.message || "Error withdrawing gold",
    });
  }
};

const handleGetDeposits = async (socket: Socket, userId: number) => {
  try {
    const history = await getDepositHistory(userId);
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      socket.emit("getDepositsError", { error: "User not found" });
      return;
    }

    const getCountdown = (timestamp: string) => {
      var targetDate = new Date(timestamp);
      targetDate.setHours(targetDate.getHours() + 24);
      var currentDate = new Date();
      var timeDiff = targetDate.getTime() - currentDate.getTime();

      if (timeDiff > 0) {
        var hours = Math.floor(timeDiff / (1000 * 60 * 60));
        var minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        return { hours, minutes, seconds };
      } else {
        return { hours: 0, minutes: 0, seconds: 0 };
      }
    };

    const userMod = new UserModel(user);
    const result = {
      deposits: userMod.maximumBankDeposits - history.length,
      nextDepositAvailable:
        history.length > 0 ? getCountdown(history[0].date_time.toString()) : 0,
    };
    socket.emit("getDepositsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting deposits:", error);
    socket.emit("getDepositsError", {
      error: error.message || "Error getting deposits",
    });
  }
};

const handleGetBankHistory = async (
  socket: Socket,
  userId: number,
  data: {
    deposits?: boolean;
    withdraws?: boolean;
    war_spoils?: boolean;
    transfers?: boolean;
    sale?: boolean;
    training?: boolean;
    economy?: boolean;
    recruitment?: boolean;
    fortification?: boolean;
    daily?: boolean;
    friend_transfers?: boolean;
    page?: number;
    limit?: number;
  },
) => {
  try {
    const {
      page = 0,
      limit = 10,
      deposits,
      withdraws,
      war_spoils,
      transfers,
      sale,
      training,
      economy,
      recruitment,
      fortification,
      daily,
      friend_transfers,
    } = data;
    const conditions = [];
    const transactionConditions = [];

    if (deposits) {
      transactionConditions.push({
        from_user_account_type: "HAND",
        to_user_id: userId,
        to_user_account_type: "BANK",
        from_user_id: userId,
        history_type: "PLAYER_TRANSFER",
      });
    }

    if (withdraws) {
      transactionConditions.push({
        from_user_account_type: "BANK",
        to_user_id: userId,
        to_user_account_type: "HAND",
        from_user_id: userId,
        history_type: "PLAYER_TRANSFER",
      });
    }

    if (war_spoils) {
      transactionConditions.push({
        history_type: "WAR_SPOILS",
      });
    }

    if (transfers) {
      transactionConditions.push({
        history_type: "PLAYER_TRANSFER",
        AND: [
          { OR: [{ from_user_id: userId }, { to_user_id: userId }] },
          {
            NOT: {
              from_user_account_type: "HAND",
              to_user_account_type: "BANK",
            },
          },
          {
            NOT: {
              from_user_account_type: "BANK",
              to_user_account_type: "HAND",
            },
          },
        ],
      });
    }

    if (sale) {
      transactionConditions.push({
        history_type: "SALE",
      });
    }

    if (training) {
      transactionConditions.push({
        history_type: "TRAINING",
      });
    }

    if (economy) {
      transactionConditions.push({
        history_type: "ECONOMY",
      });
    }

    if (recruitment) {
      transactionConditions.push({
        history_type: "RECRUITMENT",
      });
    }

    if (fortification) {
      transactionConditions.push({
        history_type: "FORTIFICATION",
      });
    }

    if (daily) {
      transactionConditions.push({
        history_type: "DAILY",
      });
    }

    if (friend_transfers) {
      transactionConditions.push({
        history_type: "FRIEND_TRANSFER",
      });
    }

    if (transactionConditions.length > 0) {
      conditions.push({ OR: transactionConditions });
    }

    const result = await getBankHistory(conditions, limit, page * limit);
    socket.emit("getBankHistorySuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting bank history:", error);
    socket.emit("getBankHistoryError", {
      error: error.message || "Error getting bank history",
    });
  }
};

const handleEquipItem = async (
  socket: Socket,
  userId: number,
  data: { items: any[] },
) => {
  try {
    const { items } = data;
    const result = await ArmoryService.equipItems({ userId, items });
    socket.emit("equipItemSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error equipping item:", error);
    socket.emit("equipItemError", {
      error: error.message || "Error equipping item",
    });
  }
};

const handleUnequipItem = async (
  socket: Socket,
  userId: number,
  data: { items: any[] },
) => {
  try {
    const { items } = data;
    const result = await ArmoryService.unequipItems({ userId, items });
    socket.emit("unequipItemSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error unequipping item:", error);
    socket.emit("unequipItemError", {
      error: error.message || "Error unequipping item",
    });
  }
};

const handleHireMercenary = async (
  socket: Socket,
  userId: number,
  data: { unitType: string; level: number; quantity: number },
) => {
  try {
    const result = await ArmoryService.hireMercenary({ userId, ...data });
    socket.emit("hireMercenarySuccess", serializeData(result));
  } catch (error: any) {
    logError("Error hiring mercenary:", error);
    socket.emit("hireMercenaryError", {
      error: error.message || "Error hiring mercenary",
    });
  }
};

const handleDismissMercenary = async (
  socket: Socket,
  userId: number,
  data: { unitType: string; level: number; quantity: number },
) => {
  try {
    const result = await ArmoryService.dismissMercenary({ userId, ...data });
    socket.emit("dismissMercenarySuccess", serializeData(result));
  } catch (error: any) {
    logError("Error dismissing mercenary:", error);
    socket.emit("dismissMercenaryError", {
      error: error.message || "Error dismissing mercenary",
    });
  }
};

const handleConvertItem = async (
  socket: Socket,
  userId: number,
  data: { fromItem: string; toItem: string; conversionAmount: number },
) => {
  try {
    const result = await ArmoryService.convertItems({ userId, ...data });
    socket.emit("convertItemSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error converting item:", error);
    socket.emit("convertItemError", {
      error: error.message || "Error converting item",
    });
  }
};

const handleAddFriend = async (
  socket: Socket,
  userId: number,
  data: { friendId: number; relationshipType: "FRIEND" | "ENEMY" },
) => {
  try {
    const result = await SocialService.addRelationship(userId, data);
    socket.emit("addFriendSuccess", serializeData(result));

    // Notify the target user if it's a friend request
    if (data.relationshipType === "FRIEND") {
      const message = `You have received a friend request from user ${userId}`;
      await handleNotifyFriendRequest({ userId: data.friendId, message });
      // Update social count for the recipient
      await emitSocialCountUpdate(data.friendId);
    }
  } catch (error: any) {
    logError("Error adding friend:", error);
    socket.emit("addFriendError", {
      error: error.message || "Error adding friend",
    });
  }
};

const handleRemoveFriend = async (
  socket: Socket,
  userId: number,
  data: { friendId: number; relationshipType: "FRIEND" | "ENEMY" },
) => {
  try {
    const result = await SocialService.removeRelationship(userId, data);
    socket.emit("removeFriendSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error removing friend:", error);
    socket.emit("removeFriendError", {
      error: error.message || "Error removing friend",
    });
  }
};

const handleRespondToFriendRequest = async (
  socket: Socket,
  userId: number,
  data: { requestId: number; action: "accept" | "decline" },
) => {
  try {
    const result = await SocialService.respondToRequest(userId, data);
    socket.emit("respondToFriendRequestSuccess", serializeData(result));

    // Update social counts for both users
    await emitSocialCountUpdate(userId);
    // Find the requester's ID from the result or request
    const request = await prisma.social.findUnique({
      where: { id: data.requestId },
      select: { playerId: true, friendId: true },
    });
    if (request) {
      const requesterId =
        request.playerId === userId ? request.friendId : request.playerId;
      await emitSocialCountUpdate(requesterId);
    }
  } catch (error: any) {
    logError("Error responding to friend request:", error);
    socket.emit("respondToFriendRequestError", {
      error: error.message || "Error responding to friend request",
    });
  }
};

const handleGetFriends = async (socket: Socket, userId: number) => {
  try {
    const result = await SocialService.listRelationships(userId, {
      type: "FRIEND",
    });
    socket.emit("getFriendsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting friends:", error);
    socket.emit("getFriendsError", {
      error: error.message || "Error getting friends",
    });
  }
};

const handleTransferGold = async (
  socket: Socket,
  userId: number,
  data: { friendId: number; amount: string | number; notes?: string },
) => {
  try {
    const amount = parseBigInt(data.amount);
    if (amount === null || amount <= 0) {
      socket.emit("transferGoldError", { error: "Invalid amount" });
      return;
    }
    const result = await SocialService.transferGoldToFriend(
      userId,
      data.friendId,
      amount,
      data.notes,
    );
    socket.emit("transferGoldSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error transferring gold:", error);
    socket.emit("transferGoldError", {
      error: error.message || "Error transferring gold",
    });
  }
};

const handleSendGoldRequest = async (
  socket: Socket,
  userId: number,
  data: { friendId: number; amount: string | number; notes?: string },
) => {
  try {
    const amount = parseBigInt(data.amount);
    if (amount === null || amount <= 0) {
      socket.emit("sendGoldRequestError", { error: "Invalid amount" });
      return;
    }
    const result = await SocialService.createGoldRequest(userId, {
      friendId: data.friendId,
      amount,
      notes: data.notes,
    });
    socket.emit("sendGoldRequestSuccess", serializeData(result));

    // Notify the target user
    const message = `You have received a gold request from user ${userId}`;
    await handleNotifyGoldRequest({ userId: data.friendId, message });
    // Update social count for the recipient
    await emitSocialCountUpdate(data.friendId);
  } catch (error: any) {
    logError("Error sending gold request:", error);
    socket.emit("sendGoldRequestError", {
      error: error.message || "Error sending gold request",
    });
  }
};

const handleRespondToGoldRequest = async (
  socket: Socket,
  userId: number,
  data: { requestId: number; action: "accept" | "decline"; message?: string },
) => {
  try {
    const result = await SocialService.respondToGoldRequest(userId, data);
    socket.emit("respondToGoldRequestSuccess", serializeData(result));

    // Update social counts for both users
    await emitSocialCountUpdate(userId);
    // Find the requester's ID from the gold request
    const goldRequest = await prisma.bank_history.findUnique({
      where: { id: data.requestId },
      select: { from_user_id: true, to_user_id: true },
    });
    if (goldRequest) {
      const requesterId = goldRequest.from_user_id;
      await emitSocialCountUpdate(requesterId);
    }
  } catch (error: any) {
    logError("Error responding to gold request:", error);
    socket.emit("respondToGoldRequestError", {
      error: error.message || "Error responding to gold request",
    });
  }
};

const handleGetGoldRequests = async (socket: Socket, userId: number) => {
  try {
    const result = await SocialService.getPendingGoldRequests(userId);
    socket.emit("getGoldRequestsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting gold requests:", error);
    socket.emit("getGoldRequestsError", {
      error: error.message || "Error getting gold requests",
    });
  }
};

const handleGetSocialRelationships = async (socket: Socket, userId: number) => {
  try {
    const result = await SocialService.getSocialSummary(userId);
    socket.emit("getSocialRelationshipsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting social relationships:", error);
    socket.emit("getSocialRelationshipsError", {
      error: error.message || "Error getting social relationships",
    });
  }
};

const handleGetTopPlayers = async (socket: Socket, userId: number) => {
  try {
    const result = await SocialService.getTopRelationships(userId, {
      type: "FRIEND",
    });
    socket.emit("getTopPlayersSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting top players:", error);
    socket.emit("getTopPlayersError", {
      error: error.message || "Error getting top players",
    });
  }
};

const handleListAllSocial = async (socket: Socket, userId: number) => {
  try {
    const result = await SocialService.listRelationships(userId, {
      type: "FRIEND",
    });
    socket.emit("listAllSocialSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error listing all social:", error);
    socket.emit("listAllSocialError", {
      error: error.message || "Error listing all social",
    });
  }
};

const handleStartRecruitSession = async (
  socket: Socket,
  userId: number,
  data: { ipAddress?: string },
) => {
  try {
    const result = await createSession(userId);
    socket.emit("startRecruitSessionSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error starting recruit session:", error);
    socket.emit("startRecruitSessionError", {
      error: error.message || "Error starting recruit session",
    });
  }
};

const handleEndRecruitSession = async (
  socket: Socket,
  userId: number,
  data: { sessionId: number },
) => {
  try {
    const result = await endSession(userId, data.sessionId);
    socket.emit("endRecruitSessionSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error ending recruit session:", error);
    socket.emit("endRecruitSessionError", {
      error: error.message || "Error ending recruit session",
    });
  }
};

const handleListRecruitSessions = async (socket: Socket, userId: number) => {
  try {
    const result = await listSessions(userId);
    socket.emit("listRecruitSessionsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error listing recruit sessions:", error);
    socket.emit("listRecruitSessionsError", {
      error: error.message || "Error listing recruit sessions",
    });
  }
};

const handleVerifyRecruitSession = async (
  socket: Socket,
  userId: number,
  data: { sessionId: number },
) => {
  try {
    const result = await validateSession(userId, data.sessionId);
    socket.emit("verifyRecruitSessionSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error verifying recruit session:", error);
    socket.emit("verifyRecruitSessionError", {
      error: error.message || "Error verifying recruit session",
    });
  }
};

const handleRecruitment = async (socket: Socket, userId: number, data: any) => {
  try {
    const validatedData = RecruitSchema.parse(data);
    let recruitedUserId: number | string = validatedData.recruitedUserId || 0;
    const selfRecruit: boolean = validatedData.selfRecruit || false;
    const sessionIdStr = validatedData.sessionId || null;
    let sessionIdNum: number | null = sessionIdStr
      ? parseInt(sessionIdStr, 10)
      : null;

    if (
      typeof recruitedUserId === "string" &&
      !Number.isInteger(Number(recruitedUserId))
    ) {
      const recruitedUser = await getUserByRecruitLink(recruitedUserId);
      recruitedUserId = recruitedUser?.id || 0;
    }

    if (!sessionIdNum) {
      sessionIdNum = null;
    }

    const ipAddress = getIpAddress({ headers: {} } as any);
    const fromUser = userId ? Number(recruitedUserId) : userId;
    const toUser = userId ? userId : Number(recruitedUserId);
    const userIdToLock = selfRecruit ? Number(recruitedUserId) : Number(toUser);
    const delayMs = mtrand(5, 17) * 100;

    const result = await prisma.$transaction(
      (tx) =>
        performRecruitmentWithSessionValidation({
          tx,
          fromUser,
          toUser,
          userIdToUpdate: userIdToLock,
          ipAddress,
          strategy: "standard",
          goldReward: 250,
          delayMs,
          sessionId: sessionIdNum,
          recruiterUserId: userId,
        }),
      { timeout: 15000, maxWait: 5000 },
    );

    await logAction(userId || toUser, "RECRUIT", ipAddress, {
      recruitedUserId,
      selfRecruit,
    });

    socket.emit("handleRecruitmentSuccess", serializeData(result));
  } catch (error: any) {
    if (error.name === "ZodError") {
      socket.emit("handleRecruitmentError", {
        error: "Invalid input",
        details: error.format(),
      });
      return;
    }
    logError("Error in recruitment:", error.message);
    const statusCode =
      error.message.includes("recruited 5 times") ||
      error.message.includes("Session")
        ? 409
        : 500;
    socket.emit("handleRecruitmentError", { error: error.message, statusCode });
  }
};

const handleGetRecruitHistory = async (socket: Socket, userId: number) => {
  try {
    const startDate = getOTStartDate();
    const endDate = getOTStartDate(1);
    const usersWithRecruitCount = await getRecruitmentRecords(
      userId,
      startDate,
      endDate,
    );

    if (!usersWithRecruitCount.length) {
      socket.emit("getRecruitHistoryError", {
        error: "No recruitment history found in the last 24 hours.",
        "24hoursago": getOTStartDate(),
      });
      return;
    }

    socket.emit(
      "getRecruitHistorySuccess",
      serializeData({ usersWithRecruitCount, "24hoursago": getOTStartDate() }),
    );
  } catch (error: any) {
    logError("Error getting recruit history:", error);
    socket.emit("getRecruitHistoryError", {
      error: error.message || "Error getting recruit history",
    });
  }
};

const handleAutoRecruit = async (socket: Socket, userId: number) => {
  try {
    const randomUser = await getRandomAutoRecruitUser();

    if (!randomUser) {
      socket.emit("autoRecruitError", {
        error: "No valid users available for recruitment.",
      });
      return;
    }

    socket.emit(
      "autoRecruitSuccess",
      serializeData({ recruit_link: randomUser.recruit_link }),
    );
  } catch (error: any) {
    logError("Error in auto recruit:", error);
    socket.emit("autoRecruitError", {
      error: error.message || "Error in auto recruit",
    });
  }
};

const handleGetRandomRecruitUser = async (
  socket: Socket,
  userId: number,
  data: { sessionId?: number },
) => {
  try {
    const { sessionId } = data;

    if (sessionId) {
      const sessionRecord = await getSession(userId, sessionId);

      if (!sessionRecord || sessionRecord.userId !== userId) {
        socket.emit("getRandomRecruitUserError", {
          error: "Invalid session ID",
        });
        return;
      }

      await updateSessionActivity(userId, sessionId);
    }

    const ipAddress = getIpAddress({ headers: {} } as any);
    const result = await getValidUsersForRecruitment(userId, ipAddress);
    if (!result || !("usersLeft" in result) || !("activeUsers" in result)) {
      socket.emit("getRandomRecruitUserError", {
        error: "Invalid response from recruitment service",
      });
      return;
    }
    const { usersLeft, activeUsers: validUsers } = result;

    const totalRecruitsLeft = Array.isArray(usersLeft)
      ? usersLeft.reduce(
          (sum, { remainingRecruits }) => sum + remainingRecruits,
          0,
        )
      : 0;

    const actuallyRecruitableUsers = Array.isArray(usersLeft)
      ? usersLeft.filter((user) => user.remainingRecruits > 0)
      : [];

    if (!validUsers || actuallyRecruitableUsers.length === 0) {
      socket.emit("getRandomRecruitUserError", {
        error: "NO_RECRUITABLE_USERS_FOUND",
        randomUser: null,
        recruitsLeft: 0,
        totalPlayerCount: validUsers.length,
        maxRecruitsExpected: validUsers.length * 5,
      });
      return;
    }

    const randomUserIndex = Math.floor(
      mtrand(0, actuallyRecruitableUsers.length - 1),
    );
    const randomUser = actuallyRecruitableUsers[randomUserIndex];

    if (!randomUser) {
      logError(
        "Failed to select a random user even though actuallyRecruitableUsers was not empty.",
      );
      socket.emit("getRandomRecruitUserError", {
        error: "Internal error selecting recruitable user.",
      });
      return;
    }

    socket.emit(
      "getRandomRecruitUserSuccess",
      serializeData({
        randomUser: {
          ...randomUser.user,
          remainingRecruits: randomUser.remainingRecruits,
        },
        recruitsLeft: totalRecruitsLeft,
        totalPlayerCount: validUsers.length,
        maxRecruitsExpected: validUsers.length * 5,
      }),
    );
  } catch (error: any) {
    logError("Error getting random recruit user:", error);
    socket.emit("getRandomRecruitUserError", {
      error: error.message || "Error getting random recruit user",
    });
  }
};

const handleGetChatRooms = async (socket: Socket, userId: number) => {
  try {
    const rooms = await MessagingService.getUserChatRooms(userId);
    socket.emit("getChatRoomsSuccess", serializeData(rooms));
  } catch (error: any) {
    logError("Error getting chat rooms:", error);
    socket.emit("getChatRoomsError", {
      error: error.message || "Error getting chat rooms",
    });
  }
};

const handleCreateChatRoom = async (
  socket: Socket,
  userId: number,
  data: {
    name?: string;
    recipients: number[];
    message?: string;
    isPrivate?: boolean;
  },
) => {
  try {
    const result = await MessagingService.createOrFindRoom(userId, data);
    socket.emit("createChatRoomSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error creating chat room:", error);
    socket.emit("createChatRoomError", {
      error: error.message || "Error creating chat room",
    });
  }
};

const handleGetRoomMessages = async (
  socket: Socket,
  userId: number,
  data: { roomId: number },
) => {
  try {
    const messages = await MessagingService.getRoomMessages(
      userId,
      data.roomId,
    );
    socket.emit("getRoomMessagesSuccess", serializeData(messages));
  } catch (error: any) {
    logError("Error getting room messages:", error);
    socket.emit("getRoomMessagesError", {
      error: error.message || "Error getting room messages",
    });
  }
};

const handleAddParticipants = async (
  socket: Socket,
  userId: number,
  data: { roomId: number; userIds: number[] },
) => {
  try {
    const result = await MessagingService.addParticipants(userId, data.roomId, {
      userIds: data.userIds,
    });
    socket.emit("addParticipantsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error adding participants:", error);
    socket.emit("addParticipantsError", {
      error: error.message || "Error adding participants",
    });
  }
};

const handleManageParticipant = async (
  socket: Socket,
  userId: number,
  data: {
    roomId: number;
    targetUserId: number;
    action: "promote" | "demote" | "updatePermissions";
    canWrite?: boolean;
  },
) => {
  try {
    const result = await MessagingService.manageParticipant(
      userId,
      data.roomId,
      data.targetUserId,
      { action: data.action, canWrite: data.canWrite },
    );
    socket.emit("manageParticipantSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error managing participant:", error);
    socket.emit("manageParticipantError", {
      error: error.message || "Error managing participant",
    });
  }
};

const handleRemoveParticipant = async (
  socket: Socket,
  userId: number,
  data: { roomId: number; targetUserId: number },
) => {
  try {
    const result = await MessagingService.removeParticipant(
      userId,
      data.roomId,
      data.targetUserId,
    );
    socket.emit("removeParticipantSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error removing participant:", error);
    socket.emit("removeParticipantError", {
      error: error.message || "Error removing participant",
    });
  }
};

const handleSearchMessages = async (
  socket: Socket,
  userId: number,
  data: {
    roomId: number;
    searchTerm?: string;
    limit?: number;
    offset?: number;
    senderId?: number;
    messageType?: string;
    startDate?: Date;
    endDate?: Date;
  },
) => {
  try {
    const result = await MessagingService.searchMessages(userId, data);
    socket.emit("searchMessagesSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error searching messages:", error);
    socket.emit("searchMessagesError", {
      error: error.message || "Error searching messages",
    });
  }
};

const handleTrainUnits = async (
  socket: Socket,
  userId: number,
  data: {
    userId: number;
    units: { type: string; level: number; quantity: number }[];
  },
) => {
  try {
    const result = await trainUnits(data);
    socket.emit("trainUnitsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error training units:", error);
    socket.emit("trainUnitsError", {
      error: error.message || "Error training units",
    });
  }
};

const handleUntrainUnits = async (
  socket: Socket,
  userId: number,
  data: {
    userId: number;
    units: { type: string; level: number; quantity: number }[];
  },
) => {
  try {
    const result = await untrainUnits(data);
    socket.emit("untrainUnitsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error untraining units:", error);
    socket.emit("untrainUnitsError", {
      error: error.message || "Error untraining units",
    });
  }
};

const handleConvertUnits = async (
  socket: Socket,
  userId: number,
  data: {
    userId: number;
    fromUnit: { type: string; level: number };
    toUnit: { type: string; level: number };
    conversionAmount: number;
  },
) => {
  try {
    const result = await convertUnits(data);
    socket.emit("convertUnitsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error converting units:", error);
    socket.emit("convertUnitsError", {
      error: error.message || "Error converting units",
    });
  }
};

const handleManageStructureUpgrades = async (
  socket: Socket,
  userId: number,
  data: {
    currentPage:
      | "fortifications"
      | "houses"
      | "economy"
      | "offense"
      | "armory"
      | "spy";
    index: number;
  },
) => {
  try {
    const result = await StructureService.upgradeStructure(userId, {
      upgradeType: data.currentPage,
      index: data.index,
    });
    socket.emit("manageStructureUpgradesSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error managing structure upgrades:", error);
    socket.emit("manageStructureUpgradesError", {
      error: error.message || "Error managing structure upgrades",
    });
  }
};

const handleManageBattleUpgrades = async (
  socket: Socket,
  userId: number,
  data: { items: any[]; operation?: "buy" | "sell" },
) => {
  try {
    const result = await BattleService.manageBattleUpgrades({
      userId,
      items: data.items,
      operation: data.operation || "buy",
    });
    socket.emit("manageBattleUpgradesSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error managing battle upgrades:", error);
    socket.emit("manageBattleUpgradesError", {
      error: error.message || "Error managing battle upgrades",
    });
  }
};

const handleCreateBlogPost = async (
  socket: Socket,
  userId: number,
  data: { title: string; content: string },
) => {
  try {
    const result = await BlogService.createPost({
      userId,
      title: data.title,
      content: data.content,
    });
    socket.emit("createBlogPostSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error creating blog post:", error);
    socket.emit("createBlogPostError", {
      error: error.message || "Error creating blog post",
    });
  }
};

const handleGetBlogPosts = async (socket: Socket, userId: number) => {
  try {
    const result = await BlogService.getPosts(userId);
    socket.emit("getBlogPostsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting blog posts:", error);
    socket.emit("getBlogPostsError", {
      error: error.message || "Error getting blog posts",
    });
  }
};

const handleGetRecentBlogPosts = async (socket: Socket, userId: number) => {
  try {
    const result = await BlogService.getRecentPosts(userId);
    socket.emit("getRecentBlogPostsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting recent blog posts:", error);
    socket.emit("getRecentBlogPostsError", {
      error: error.message || "Error getting recent blog posts",
    });
  }
};

const handleUpdateBlogReadStatus = async (
  socket: Socket,
  userId: number,
  data: { postId: number },
) => {
  try {
    const result = await BlogService.updateReadStatus({
      userId,
      postId: data.postId,
    });
    socket.emit("updateBlogReadStatusSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error updating blog read status:", error);
    socket.emit("updateBlogReadStatusError", {
      error: error.message || "Error updating blog read status",
    });
  }
};

const handleGetLatestUnreadBlogPost = async (
  socket: Socket,
  userId: number,
) => {
  try {
    const result = await BlogService.getLatestUnreadPost(userId);
    socket.emit("getLatestUnreadBlogPostSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting latest unread blog post:", error);
    socket.emit("getLatestUnreadBlogPostError", {
      error: error.message || "Error getting latest unread blog post",
    });
  }
};

const handleGetUserData = async (socket: Socket, userId: number) => {
  try {
    const result = await GeneralService.getUserData(userId);
    socket.emit("getUserDataSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting user data:", error);
    socket.emit("getUserDataError", {
      error: error.message || "Error getting user data",
    });
  }
};

const handleSearchUsers = async (
  socket: Socket,
  userId: number,
  data: { name: string },
) => {
  try {
    const result = await GeneralService.searchUsers(data.name);
    socket.emit("searchUsersSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error searching users:", error);
    socket.emit("searchUsersError", {
      error: error.message || "Error searching users",
    });
  }
};

const handleCheckDisplayName = async (
  socket: Socket,
  userId: number,
  data: { displayName: string },
) => {
  try {
    // This function doesn't exist in GeneralService, so I'll implement it directly
    const existingUser = await prisma.users.findFirst({
      where: {
        display_name: {
          equals: data.displayName,
          mode: "insensitive",
        },
      },
    });

    const exists = !!existingUser;
    const possibleMatches = exists ? [] : []; // Could implement fuzzy matching here

    socket.emit(
      "checkDisplayNameSuccess",
      serializeData({ exists, possibleMatches }),
    );
  } catch (error: any) {
    logError("Error checking display name:", error);
    socket.emit("checkDisplayNameError", {
      error: error.message || "Error checking display name",
    });
  }
};

const handleGetOnlinePlayers = async (socket: Socket, userId: number) => {
  try {
    // This function doesn't exist in GeneralService, so I'll implement it directly
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [allUsersCounted, onlineUsers, newUsers, newestUser] =
      await Promise.all([
        prisma.users.count(),
        prisma.users.count({
          where: {
            last_active: {
              gte: fiveMinutesAgo,
            },
          },
        }),
        prisma.users.count({
          where: {
            created_at: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        }),
        prisma.users.findFirst({
          orderBy: {
            created_at: "desc",
          },
          select: {
            display_name: true,
          },
        }),
      ]);

    const result = {
      allUsersCounted,
      onlineUsers,
      newUsers,
      newestUser: newestUser?.display_name || null,
    };

    socket.emit("getOnlinePlayersSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting online players:", error);
    socket.emit("getOnlinePlayersError", {
      error: error.message || "Error getting online players",
    });
  }
};

const handleCompareTop = async (socket: Socket, userId: number) => {
  try {
    // This function doesn't exist in GeneralService, so I'll implement it directly
    const topPlayers = await prisma.users.findMany({
      take: 10,
      orderBy: {
        experience: "desc",
      },
      select: {
        id: true,
        display_name: true,
        experience: true,
        race: true,
        class: true,
      },
    });

    socket.emit("compareTopSuccess", serializeData({ topPlayers }));
  } catch (error: any) {
    logError("Error comparing top players:", error);
    socket.emit("compareTopError", {
      error: error.message || "Error comparing top players",
    });
  }
};

const handleResetGame = async (socket: Socket, userId: number) => {
  try {
    // This function doesn't exist in GeneralService, so I'll implement it directly
    // Reset game functionality - this is a complex operation that would need careful implementation
    // For now, just return an error indicating this needs to be implemented
    socket.emit("resetGameError", {
      error: "Game reset functionality not yet implemented",
    });
  } catch (error: any) {
    logError("Error resetting game:", error);
    socket.emit("resetGameError", {
      error: error.message || "Error resetting game",
    });
  }
};

const handleRevalidate = async (socket: Socket, userId: number) => {
  try {
    // This function doesn't exist in GeneralService, so I'll implement it directly
    // Revalidate user data - could trigger a refresh of cached data
    const userData = await UserDataService.getFullUserData(userId);
    socket.emit(
      "revalidateSuccess",
      serializeData({ userData, message: "User data revalidated" }),
    );
  } catch (error: any) {
    logError("Error revalidating:", error);
    socket.emit("revalidateError", {
      error: error.message || "Error revalidating",
    });
  }
};

const handleGetUserBreakdown = async (socket: Socket, userId: number) => {
  try {
    // This function doesn't exist in GeneralService, so I'll implement it directly
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: {
        UserUnit: true,
        UserItem: true,
        UserStructureUpgrade: true,
        UserBattleUpgrade: true,
      },
    });

    if (!user) {
      socket.emit("getUserBreakdownError", { error: "User not found" });
      return;
    }

    const breakdown = {
      units: user.UserUnit,
      items: user.UserItem,
      structureUpgrades: user.UserStructureUpgrade,
      battleUpgrades: user.UserBattleUpgrade,
    };

    socket.emit("getUserBreakdownSuccess", serializeData(breakdown));
  } catch (error: any) {
    logError("Error getting user breakdown:", error);
    socket.emit("getUserBreakdownError", {
      error: error.message || "Error getting user breakdown",
    });
  }
};

const handleGetUserStats = async (socket: Socket, userId: number) => {
  try {
    // This function doesn't exist in GeneralService, so I'll implement it directly
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        display_name: true,
        experience: true,
        gold: true,
        gold_in_bank: true,
        attack_turns: true,
        stats: true,
      },
    });

    if (!user) {
      socket.emit("getUserStatsError", { error: "User not found" });
      return;
    }

    const stats =
      typeof user.stats === "string"
        ? JSON.parse(user.stats)
        : user.stats || [];
    const result = {
      ...user,
      stats,
    };

    socket.emit("getUserStatsSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error getting user stats:", error);
    socket.emit("getUserStatsError", {
      error: error.message || "Error getting user stats",
    });
  }
};

const handleGetUserInfoByRecruitLink = async (
  socket: Socket,
  userId: number,
  data: { recruitLink: string },
) => {
  try {
    const user = await prisma.users.findFirst({
      where: {
        recruit_link: data.recruitLink,
      },
      select: {
        id: true,
        display_name: true,
        race: true,
        class: true,
        experience: true,
      },
    });

    if (!user) {
      socket.emit("getUserInfoByRecruitLinkError", { error: "User not found" });
      return;
    }

    socket.emit("getUserInfoByRecruitLinkSuccess", serializeData(user));
  } catch (error: any) {
    logError("Error getting user info by recruit link:", error);
    socket.emit("getUserInfoByRecruitLinkError", {
      error: error.message || "Error getting user info by recruit link",
    });
  }
};

// --- Phase 4: Administrative & Utility Handlers ---

const handleAdminAccountAction = async (
  socket: Socket,
  userId: number,
  data: { targetUserId: number; action: string; reason?: string },
) => {
  try {
    const accountActionData = {
      userId: data.targetUserId,
      action: data.action as "SUSPENDED" | "BANNED" | "CLOSED" | "ACTIVE",
      reason: data.reason,
    };
    const result = await AdminService.performAccountAction(
      userId,
      accountActionData,
    );
    socket.emit("adminAccountActionSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error in admin account action:", error);
    socket.emit("adminAccountActionError", {
      error: error.message || "Error performing admin account action",
    });
  }
};

const handleGrantPermission = async (
  socket: Socket,
  userId: number,
  data: { targetUserId: number; permission: string },
) => {
  try {
    // We need to get the user's identifier (username or email) from the userId
    const targetUser = await prisma.users.findUnique({
      where: { id: data.targetUserId },
      select: { display_name: true, email: true },
    });

    if (!targetUser) {
      socket.emit("grantPermissionError", { error: "Target user not found" });
      return;
    }

    const grantData = {
      userIdentifier: targetUser.display_name || targetUser.email,
      permission: data.permission as any, // Cast to PermissionType
    };

    const result = await AdminService.grantPermission(userId, grantData);
    socket.emit("grantPermissionSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error granting permission:", error);
    socket.emit("grantPermissionError", {
      error: error.message || "Error granting permission",
    });
  }
};

const handleStartEra = async (socket: Socket, userId: number) => {
  try {
    const result = await startNewEra();
    socket.emit("startEraSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error starting new era:", error);
    socket.emit("startEraError", {
      error: error.message || "Error starting new era",
    });
  }
};

const handleGetConstants = async (socket: Socket, userId: number) => {
  try {
    // Import constants from their respective files
    const { UnitTypes } = await import("@/constants/Units");
    const { ItemTypes } = await import("@/constants/Items");
    const { EconomyUpgrades, OffensiveUpgrades, SentryUpgrades, SpyUpgrades } =
      await import("@/constants/Structure_Upgrades");
    const { BattleUpgrades } = await import("@/constants/Battle_Upgrades");

    const constants = {
      units: UnitTypes,
      items: ItemTypes,
      upgrades: {
        economy: EconomyUpgrades,
        offensive: OffensiveUpgrades,
        sentry: SentryUpgrades,
        spy: SpyUpgrades,
      },
      battleUpgrades: BattleUpgrades,
    };

    socket.emit("getConstantsSuccess", serializeData(constants));
  } catch (error: any) {
    logError("Error getting constants:", error);
    socket.emit("getConstantsError", {
      error: error.message || "Error getting constants",
    });
  }
};

const handleGetRankBreakdown = async (socket: Socket, userId: number) => {
  try {
    const { calculateOverallRank } = await import("@/utils/utilities");

    const allUsers = await prisma.users.findMany({
      include: {
        UserUnit: true,
        UserItem: true,
        UserStructureUpgrade: true,
        UserBattleUpgrade: true,
        UserBonusPoints: true,
        permissions: true,
        stats: true,
      },
    });

    const userRanks = allUsers.map((user) => {
      const userModel = new UserModel(
        user,
        user.UserUnit,
        user.UserItem,
        user.UserStructureUpgrade,
        user.UserBattleUpgrade,
        user.UserBonusPoints,
        user.permissions.map((p) => ({ type: p })),
        user.stats,
      );
      const rankScore = calculateOverallRank(user);

      return {
        id: user.id,
        display_name: user.display_name,
        rankScore,
        experience: user.experience,
        gold: user.gold,
        gold_in_bank: user.gold_in_bank,
        attack_turns: user.attack_turns,
        race: user.race,
        class: user.class,
      };
    });

    userRanks.sort((a, b) => b.rankScore - a.rankScore);

    socket.emit("getRankBreakdownSuccess", serializeData(userRanks));
  } catch (error: any) {
    logError("Error getting rank breakdown:", error);
    socket.emit("getRankBreakdownError", {
      error: error.message || "Error getting rank breakdown",
    });
  }
};

const handleDailyCron = async (
  socket: Socket,
  userId: number,
  data: { authToken: string },
) => {
  try {
    // Verify admin authorization
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user || !user.permissions.some((p) => p === "ADMINISTRATOR")) {
      socket.emit("dailyCronError", {
        error: "Unauthorized: Administrator access required",
      });
      return;
    }

    const result = await CronJobService.processDailyUpdates();
    socket.emit("dailyCronSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error running daily cron:", error);
    socket.emit("dailyCronError", {
      error: error.message || "Error running daily cron",
    });
  }
};

const handleTurnsCron = async (
  socket: Socket,
  userId: number,
  data: { authToken: string },
) => {
  try {
    // Verify admin authorization
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user || !user.permissions.some((p) => p === "ADMINISTRATOR")) {
      socket.emit("turnsCronError", {
        error: "Unauthorized: Administrator access required",
      });
      return;
    }

    const result = await CronJobService.processTurnUpdates();
    socket.emit("turnsCronSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error running turns cron:", error);
    socket.emit("turnsCronError", {
      error: error.message || "Error running turns cron",
    });
  }
};

const handleAccountStatusCron = async (
  socket: Socket,
  userId: number,
  data: { authToken: string },
) => {
  try {
    // Verify admin authorization
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user || !user.permissions.some((p) => p === "ADMINISTRATOR")) {
      socket.emit("accountStatusCronError", {
        error: "Unauthorized: Administrator access required",
      });
      return;
    }

    const result = await CronJobService.processAccountStatusUpdates();
    socket.emit("accountStatusCronSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error running account status cron:", error);
    socket.emit("accountStatusCronError", {
      error: error.message || "Error running account status cron",
    });
  }
};

const handleVerifyCaptcha = async (
  socket: Socket,
  userId: number,
  data: { token: string },
) => {
  try {
    const verifyEndpoint =
      "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const secret = process.env.NEXT_PUBLIC_TURNSTILE_SECRET;

    const response = await fetch(verifyEndpoint, {
      method: "POST",
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(data.token)}`,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok) {
      throw new Error("Verification failed");
    }

    const result = await response.json();
    socket.emit("verifyCaptchaSuccess", serializeData(result));
  } catch (error: any) {
    logError("Error verifying captcha:", error);
    socket.emit("verifyCaptchaError", {
      error: error.message || "Error verifying captcha",
    });
  }
};

const handleNotifyAttack = async ({ battleId, defenderId }) => {
  const message = `You were attacked in battle ${battleId}`;
  const hash = md5(message + battleId + defenderId);
  io!.to(`user-${defenderId}`).emit("attackNotification", { message, hash });
};

const handleNotifyFriendRequest = async ({ userId: targetUserId, message }) => {
  const hash = md5(message + targetUserId);
  io!
    .to(`user-${targetUserId}`)
    .emit("friendRequestNotification", { message, hash });
};

const handleNotifyEnemyDeclaration = async ({
  userId: targetUserId,
  message,
}) => {
  const hash = md5(message + targetUserId);
  io!
    .to(`user-${targetUserId}`)
    .emit("enemyDeclarationNotification", { message, hash });
};

const handleNotifyGoldRequest = async ({ userId: targetUserId, message }) => {
  const hash = md5(message + targetUserId);
  io!
    .to(`user-${targetUserId}`)
    .emit("goldRequestNotification", { message, hash });
};

const handleAlertNotification = (alert: any) => {
  logInfo("Received alert notification:", alert);
  io!.emit("alertNotification", alert); // Broadcast to all
};

const handlePing = ({ userId: targetUserId }) => {
  logInfo("Ping received for user:", targetUserId);
  io!.to(`user-${targetUserId}`).emit("pong");
};

const handleDisconnect = (socket: Socket, userId: number, reason: string) => {
  logInfo(
    `Socket ${socket.id} disconnected for user ${userId}. Reason: ${reason}`,
  );
  const userSocketSet = userSockets.get(userId);
  if (userSocketSet) {
    userSocketSet.delete(socket.id);
    logInfo(
      `Removed socket ${socket.id} from user ${userId}. Remaining: ${Array.from(userSocketSet)}`,
    );
    if (userSocketSet.size === 0) {
      userSockets.delete(userId);
      logInfo(`User ${userId} has no active sockets. Removed from map.`);
    }
  }
};

// --- Helper Functions ---

// Helper to check log sharing permission
async function checkLogSharePermission(
  userId: number,
  log: {
    id: number;
    attacker_id: number;
    defender_id: number;
    acl: {
      shared_with_user_id: number | null;
      shared_with_alliance_id: number | null;
    }[];
  },
): Promise<boolean> {
  if (log.attacker_id === userId || log.defender_id === userId) return true;
  if (log.acl.some((acl) => acl.shared_with_user_id === userId)) return true;

  const userAllianceIds = (
    await prisma.alliance_memberships.findMany({
      where: { user_id: userId },
      select: { alliance_id: true },
    })
  ).map((m) => m.alliance_id);
  if (
    log.acl.some(
      (acl) =>
        acl.shared_with_alliance_id &&
        userAllianceIds.includes(acl.shared_with_alliance_id),
    )
  )
    return true;

  return false;
}

// Helper to grant ACL to participants
async function grantAclToParticipants(
  logId: number,
  roomId: number,
  senderId: number,
) {
  logInfo(
    `[ACL Grant] Attempting grant for log ${logId}, room ${roomId}, sender ${senderId}`,
  );
  try {
    const recipientParticipants = await prisma.chatRoomParticipant.findMany({
      where: { roomId: roomId, userId: { not: senderId } },
      select: { userId: true },
    });
    logInfo(
      `[ACL Grant] Found recipients: ${JSON.stringify(recipientParticipants.map((p) => p.userId))}`,
    );

    if (recipientParticipants.length === 0) {
      logInfo(
        `[ACL Grant] No recipients found for room ${roomId} (excluding sender ${senderId}). Skipping ACL creation.`,
      );
      return;
    }

    const aclDataToCreate = recipientParticipants.map((p) => ({
      attack_log_id: logId,
      shared_with_user_id: p.userId,
    }));
    logInfo(
      `[ACL Grant] Prepared ACL data: ${JSON.stringify(aclDataToCreate)}`,
    );

    const createdAcls = await prisma.attack_log_acl.createMany({
      data: aclDataToCreate,
      skipDuplicates: true,
    });
    logInfo(
      `[ACL Grant] Successfully created ${createdAcls.count} ACL entries for shared log ${logId} in room ${roomId}`,
    );
  } catch (aclError) {
    logError(
      `[ACL Grant] FAILED to create ACL entries for shared log ${logId} in room ${roomId}:`,
      aclError,
    );
  }
}

// Helper to send notifications
async function sendNotifications(
  roomId: number,
  senderId: number,
  message: MessageWithRelationsPayload,
) {
  const participants = await prisma.chatRoomParticipant.findMany({
    where: { roomId: roomId, userId: { not: senderId } },
    select: { userId: true },
  });

  const notificationPayload = {
    id: message.id,
    senderId: senderId,
    senderName: message.sender.display_name,
    content:
      message.content.substring(0, 50) +
      (message.content.length > 50 ? "..." : ""),
    timestamp: safeToISOString(message.sentAt),
    isRead: false,
    chatRoomId: roomId,
  };

  participants.forEach((p) => {
    const recipientUserId = p.userId;
    logInfo(`Emitting 'newMessageNotification' to user-${recipientUserId}`);
    io?.to(`user-${recipientUserId}`).emit(
      "newMessageNotification",
      notificationPayload,
    ); // Use optional chaining for io
  });
}

// Helper function to find userId from socketId using the userSockets map
const findUserIdBySocketId = (socketId: string): number | string => {
  let foundUserId: number | string = "Unknown";
  userSockets.forEach((socketIdSet, uid) => {
    if (socketIdSet.has(socketId)) {
      foundUserId = uid;
    }
  });
  return foundUserId;
};

// Helper function to emit social count updates to a specific user
const emitSocialCountUpdate = async (userId: number) => {
  try {
    // Get combined social notifications count
    const [friendRequests, goldRequests] = await Promise.all([
      SocialService.countPendingRequests(userId),
      SocialService.countPendingGoldRequests(userId),
    ]);
    const totalCount = (friendRequests.count || 0) + (goldRequests.count || 0);
    io!.to(`user-${userId}`).emit("socialCountUpdate", { count: totalCount });
  } catch (error) {
    logError("Error emitting social count update:", error);
  }
};

// Helper function to emit gold request count updates to a specific user
const emitGoldRequestCountUpdate = async (userId: number) => {
  try {
    const result = await SocialService.countPendingGoldRequests(userId);
    io!
      .to(`user-${userId}`)
      .emit("goldRequestCountUpdate", { count: result.count || 0 });
  } catch (error) {
    logError("Error emitting gold request count update:", error);
  }
};

export const getSocketIO = (): Server | null => {
  if (!io) {
    logError("Socket.IO has not been initialized!");
    return null;
  }
  return io;
};
