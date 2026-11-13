import { Suspense } from "react";
import { HomeScreen } from "./home-screen";

// Page.tsx acts as the routing entry point rendering the HomeScreen component
export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-secondary font-medium">Đang tải...</p>
      </div>
    }>
      <HomeScreen />
    </Suspense>
  );
}
