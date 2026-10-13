"use client";

import {LocationQueueToast} from "@/components/leads/LocationQueueToast";
import React, { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}<LocationQueueToast/></AuthProvider>;
}
