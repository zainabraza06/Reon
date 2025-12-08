import ChatPage from "@/components/chat/ChatPage";
import ProtectedRoute from "@/components/ProtectedRoute";


export default function Chatpage() {
 return (<ProtectedRoute>
   <ChatPage/>
  </ProtectedRoute>);
}