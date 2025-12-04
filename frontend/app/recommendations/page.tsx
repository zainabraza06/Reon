import RecommendedFriendsPage from "@/components/recommendations/RecommendationPage";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function RecommendationPage() {
  return (<ProtectedRoute>
      <RecommendedFriendsPage/>
  </ProtectedRoute>
 );
}