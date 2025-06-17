import React from "react";
import { Handle, Position } from "@xyflow/react";

const MAX_DESC_WORDS = 36;

export default function CenterNode({
  data,
}: {
  data: {
    image: string;
    title: string;
    description: string;
  };
}) {
  const words = data.description
    ? data.description.split(/\s+/).filter((word) => word.length > 0)
    : [];
  const desc =
    words.length <= MAX_DESC_WORDS
      ? data.description
      : data.description
          .trim()
          .split(/\s+/)
          .slice(0, MAX_DESC_WORDS)
          .join(" ") + " [...]";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: 10,
        border: "1px solid rgb(130, 121, 163)",
        borderRadius: 8,
        maxWidth: 500,
        maxHeight: 200,
        minWidth: 500,
        minHeight: 200,
        width: 500,
        height: 200,
        backgroundColor: "rgb(35, 47, 55)",
      }}
    >
      {data.image && (
        <img
          src={data.image}
          alt=""
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            marginRight: 12,
            objectFit: "cover",
          }}
        />
      )}

      <div>
        <div style={{ fontWeight: "bold", fontSize: 20 }}>{data.title}</div>
        <div style={{ fontSize: 16, overflowY: "auto" }}>{desc}</div>
      </div>
      {/* Optionally add handles for connecting edges */}
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
    </div>
  );
}
