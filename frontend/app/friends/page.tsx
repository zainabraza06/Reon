
'use client';
import MyFriendsPage from "@/components/friends/MyFriendsPage";

import ProtectedRoute from "@/components/ProtectedRoute";



export default function FriendsPage() {
   return (<ProtectedRoute>
   <MyFriendsPage/>
  </ProtectedRoute>);
}