import React, { useState, useEffect } from "react";
import { ChatItem, User } from "@/types";
import { Search, Users, X, Check, CheckCheck } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import UserProfile from "@/components/chat/UserProfile";

interface SidebarProps {
  users: ChatItem[];
  currentUserId: string;
  selectedId?: string;
  onSelectUser: (user: ChatItem) => void;
  onSearch: (query: string) => Promise<ChatItem[]>;
  currentUser: User;
  searchResults?: ChatItem[];
  clearSearchResults?: () => void;
  onMessageStatusUpdate?: (chatId: string, status: "sent" | "delivered" | "read") => void;
  onUserTyping?: (chatId: string, isTyping: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  users,
  currentUserId,
  selectedId,
  onSelectUser,
  onSearch,
  currentUser,
  searchResults = [],
  clearSearchResults,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [optimizedUsers, setOptimizedUsers] = useState<ChatItem[]>(users);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentMap = new Map(optimizedUsers.map((u) => [u._id, u]));
    let needsUpdate = optimizedUsers.length !== users.length;
    if (!needsUpdate) {
      for (const user of users) {
        const ex = currentMap.get(user._id);
        if (
          !ex ||
          ex.tickStatus !== user.tickStatus ||
          ex.unreadCount !== user.unreadCount ||
          ex.lastMessage !== user.lastMessage ||
          ex.lastMessageTime !== user.lastMessageTime ||
          ex.isOnline !== user.isOnline ||
          ex.isTyping !== user.isTyping
        ) {
          needsUpdate = true;
          break;
        }
      }
    }
    if (needsUpdate) setOptimizedUsers(users);
  }, [users, optimizedUsers]);

  const isSearchActive = searchQuery.trim().length > 0;
  const displayItems =
    isSearchActive && searchResults.length > 0 ? searchResults : optimizedUsers;

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length > 1) {
      setIsSearching(true);
      try { await onSearch(q); }
      catch { clearSearchResults?.(); }
      finally { setIsSearching(false); }
    } else {
      setIsSearching(false);
      clearSearchResults?.();
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    clearSearchResults?.();
    setIsSearching(false);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.target as HTMLImageElement;
    t.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(t.alt || "User")}&background=random`;
  };

  const formatLastMessage = (item: ChatItem): string => {
    if (item.isTyping) return "Typing...";
    if (item.lastMessage?.trim()) return item.lastMessage;
    if (item.lastMessageMedia) {
      const m = item.lastMessageMedia;
      if (m === "image") return "📷 Photo";
      if (m === "video") return "🎬 Video";
      if (m === "audio") return "🎵 Audio";
      if (m === "document") return "📎 Document";
      return "📎 File";
    }
    return "No messages yet";
  };

  const renderTickStatus = (status: "none" | "sent" | "delivered" | "read", isSelected: boolean) => {
    const color = isSelected ? "text-white/80" : "text-gray-400";
    switch (status) {
      case "sent":
        return <Check size={12} className={color} />;
      case "delivered":
        return (
          <div className="relative flex w-4 h-4 items-center justify-center">
            <Check size={10} className={`${color} absolute left-0.5`} />
            <Check size={10} className={`${color} absolute left-1.5`} />
          </div>
        );
      case "read":
        return <CheckCheck size={12} className={isSelected ? "text-blue-300" : "text-blue-400"} />;
      default:
        return null;
    }
  };

  const renderItem = (item: ChatItem, index: number) => {
    const isSelected = selectedId === item._id;
    const isLastFromMe = item.lastMessageSenderId === currentUserId;
    const showTicks = isLastFromMe && item.tickStatus && item.tickStatus !== "none";

    return (
      <div
        key={`${item._id}-${index}`}
        onClick={() => onSelectUser(item)}
        className={`flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 mb-1 relative overflow-hidden border ${
          isSelected
            ? "bg-gradient-to-r from-blue-500/15 to-blue-600/10 border-blue-500/30 shadow-md"
            : "border-transparent hover:bg-white/5 hover:border-white/10 hover:translate-x-0.5"
        }`}
      >
        {/* Active bar */}
        {isSelected && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-blue-400 to-blue-600 rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        )}

        {/* Avatar */}
        <div className="relative shrink-0">
          <img
            src={item.profilePic || `https://ui-avatars.com/api/?name=${item.username}&background=random`}
            alt={item.username || "User"}
            className={`w-12 h-12 rounded-full object-cover border-2 transition-all sm:w-10 sm:h-10 ${
              isSelected ? "border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.3)]" : "border-transparent"
            }`}
            onError={handleImageError}
          />
          <div className="absolute -bottom-0.5 -right-0.5 flex gap-0.5">
            {item.isOnline && (
              <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#1a1a2e] shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex justify-between items-start mb-0.5">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h4 className={`font-semibold text-sm truncate transition-all sm:text-[13px] ${isSelected ? "text-white" : "text-white/90"}`}>
                {item.fullName || item.username}
              </h4>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-1">
              {item.lastMessageTime && (
                <span className={`text-[10px] font-medium tracking-wide ${isSelected ? "text-white/70" : "text-white/40"}`}>
                  {formatRelativeTime(item.lastMessageTime)}
                </span>
              )}
              {!item.isTyping && item.unreadCount > 0 && (
                <div className={`text-[10px] font-bold min-w-5 h-5 flex items-center justify-center rounded-full px-1.5 animate-badge-pop ${
                  isSelected
                    ? "bg-white text-blue-600 shadow-[0_2px_8px_rgba(255,255,255,0.3)]"
                    : "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-[0_2px_8px_rgba(59,130,246,0.4)]"
                }`}>
                  {item.unreadCount > 99 ? "99+" : item.unreadCount}
                </div>
              )}
            </div>
          </div>

          {/* Footer row */}
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex items-center flex-1 min-w-0 gap-1">
              <p className={`text-xs truncate transition-all flex-1 min-w-0 sm:text-[11px] ${
                item.isTyping
                  ? "text-purple-400 font-medium animate-pulse-fade"
                  : isSelected
                  ? "text-white/70"
                  : "text-white/50"
              }`}>
                {formatLastMessage(item)}
              </p>
              {item.isTyping && (
                <div className="flex gap-0.5 ml-1">
                  <span className="w-1 h-1 rounded-full bg-purple-400 animate-typing-dot" />
                  <span className="w-1 h-1 rounded-full bg-purple-400 animate-typing-dot" />
                  <span className="w-1 h-1 rounded-full bg-purple-400 animate-typing-dot" />
                </div>
              )}
              {showTicks && !item.isTyping && (
                <div className={`flex items-center justify-center shrink-0 w-4 h-4 transition-all ${isSelected ? "scale-110" : ""}`}>
                  {renderTickStatus(item.tickStatus!, isSelected)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const typingUsersCount = displayItems.filter((i) => i.isTyping).length;

  return (
    <div className="h-full flex flex-col w-full bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center shrink-0">
        <UserProfile
          currentUser={currentUser}
          showUserMenu={showUserMenu}
          setShowUserMenu={setShowUserMenu}
          userMenuRef={userMenuRef}
          pendingFriendRequests={currentUser?.pendingFriendRequests || 0}
          currentPage="messages"
        />
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 z-[1]" size={16} />
          <input
            type="text"
            placeholder="Search users"
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-sm text-white placeholder-white/40 outline-none transition-all focus:bg-white/10 focus:border-blue-500/50 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-none border-0 cursor-pointer text-white/40 p-1 rounded hover:text-white/80 hover:bg-white/5 transition-all"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Global typing badge */}
      {typingUsersCount > 0 && (
        <div className="mx-4 mb-2 px-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 rounded-[20px] border border-purple-500/20">
            <div className="text-xs font-bold text-purple-500 bg-white w-[18px] h-[18px] rounded-full flex items-center justify-center">
              {typingUsersCount}
            </div>
            <span className="text-xs text-purple-400 font-medium">
              {typingUsersCount === 1 ? "User is typing" : `${typingUsersCount} users typing`}
            </span>
            <div className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-purple-400 animate-typing-dot" />
              <span className="w-1 h-1 rounded-full bg-purple-400 animate-typing-dot" />
              <span className="w-1 h-1 rounded-full bg-purple-400 animate-typing-dot" />
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-2 custom-scrollbar">
        {/* Search header */}
        {isSearchActive && (
          <div className="flex justify-between items-center mb-3 px-1">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.5px]">
              {isSearching
                ? "Searching..."
                : searchResults.length > 0
                ? `Search Results (${searchResults.length})`
                : "Search Results"}
            </p>
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="text-xs text-white/50 bg-none border-0 cursor-pointer px-2 py-1 rounded hover:text-white/80 hover:bg-white/5 font-medium transition-all"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin-ring mb-4" />
            <p className="text-sm text-white/50 font-medium">Searching...</p>
          </div>
        ) : displayItems.length > 0 ? (
          <div>{displayItems.map((item, i) => renderItem(item, i))}</div>
        ) : isSearchActive ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="text-white/40 mb-4 opacity-70" size={32} />
            <p className="text-sm text-white/50 font-medium mb-2">
              No results for &quot;{searchQuery}&quot;
            </p>
            <button
              onClick={clearSearch}
              className="text-xs text-white/60 bg-white/5 border border-white/10 px-3 py-1.5 rounded font-medium cursor-pointer hover:bg-white/10 hover:text-white/80 hover:-translate-y-px transition-all"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border-2 border-dashed border-white/10">
              <Users className="text-white/40" size={24} />
            </div>
            <p className="font-semibold text-white/80 mb-1 text-sm">No chats yet</p>
            <p className="text-xs text-white/50 leading-relaxed">
              Search for users to start a conversation
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
