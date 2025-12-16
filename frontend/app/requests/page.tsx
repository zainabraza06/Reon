'use client';
import FriendRequestsPage from "@/components/requests/RequestPage";
import ProtectedRoute from "@/components/ProtectedRoute";


export default function RequestPage(){
  return (<ProtectedRoute>
      <FriendRequestsPage />
    </ProtectedRoute>
  );
}