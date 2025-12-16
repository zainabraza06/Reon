

'use client';
import OnboardingPage from "@/components/auth/settings/OnBoardPage";
import ProtectedRoute from "@/components/ProtectedRoute";


export default function OnBoardingPage(){
  return (<ProtectedRoute>
   <OnboardingPage/>;
  </ProtectedRoute>);
}