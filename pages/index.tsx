"use server";
import React, { useCallback } from "react";
import "@xyflow/react/dist/style.css";
import { ViewPage } from "./search/[searchParam]";

export default function App() {
  return <ViewPage pageName={"zebra"} />;
}
