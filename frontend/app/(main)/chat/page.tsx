import { MessageSquare } from "lucide-react";

export default function ChatLandingPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-white dark:bg-gray-900 flex-col gap-4">
      <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
        <MessageSquare size={28} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your messages</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a conversation to start messaging</p>
      </div>
    </div>
  );
}
