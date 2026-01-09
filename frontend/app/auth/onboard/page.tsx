'use client';
import OnboardingPage from "@/components/auth/settings/OnBoardPage";
import OnboardingRoute from "@/components/OnboardingRoute";


export default function OnBoardingPage(){
  return (
    <OnboardingRoute>
      <OnboardingPage />
    </OnboardingRoute>
  );
}