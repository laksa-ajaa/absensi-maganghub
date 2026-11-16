import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="retro-grid min-h-screen bg-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="retro-badge inline-flex items-center gap-2 px-3 py-1 bg-primary-soft text-primary text-xs font-mono uppercase tracking-wider">
            <span className="h-2 w-2 bg-primary" /> MagangHub Bot
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
