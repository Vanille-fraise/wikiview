import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { View } from "./view";
import { cleanSummary } from "../lib/utils";

export default function CenterNode({
  data,
}: {
  data: {
    view: View;
  };
}) {
  const [isImgHovered, setIsImgHovered] = useState(false);

  const desc = cleanSummary(data.view.summary);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: 10,
        border: "1px solid rgb(242, 219, 255)",
        borderRadius: 8,
        maxWidth: 500,
        maxHeight: 200,
        minWidth: 500,
        minHeight: 200,
        width: 500,
        height: 200,
        backgroundColor: "rgb(35, 47, 55)",
      }}
      onMouseEnter={() => setIsImgHovered(true)}
      onMouseLeave={() => setIsImgHovered(false)}
    >
      <img
        src={data.view.descImg || ""}
        alt=""
        style={{
          width: 60,
          minWidth: 60,
          height: 60,
          borderRadius: "50%",
          marginRight: 12,
          objectFit: "cover",
          backgroundColor: "transparent",
          opacity: isImgHovered ? 0.8 : 1,
        }}
      />
      <div>
        <div style={{ fontWeight: "bold", fontSize: 20 }}>
          {data.view.pageName}
        </div>
        <div style={{ fontSize: 16, overflowY: "auto" }}>{desc}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
    </div>
  );
}
