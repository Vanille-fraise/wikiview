import React, { useState, useRef, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import { View } from "./view";
import { SUMMARY_LENGTH } from "../lib/variables";
import { cleanSummary } from "../lib/utils";

const SMART_MIC = "/smart-mic-ico.png";

export default function CenterNode({
  data,
}: {
  data: {
    view: View;
  };
}) {
  const [isImgHovered, setIsImgHovered] = useState(false);
  const [audioSrc, setAudioSrc] = useState(
    data.view.audio ? data.view.audio : undefined
  );
  const [isLoading, setIsLoading] = useState(false);

  const desc = cleanSummary(data.view.summary);

  const getAndPlayAudio = async (v: View) => {
    if (isLoading) {
      return;
    }
    if (audioSrc) {
      return await new Audio(audioSrc).play();
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/tools/audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ view: v }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          new Error(
            `Network response was not ok: ${response.status}. Server message: ${errorText}`
          )
        );
        return;
      }
      const { url } = await response.json();
      setAudioSrc(url);
      return await new Audio(url).play();
    } catch (error) {
      console.error("Error fetching audio:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
        cursor: "pointer",
      }}
      onClick={() => {
        getAndPlayAudio(data.view);
      }}
      onMouseEnter={() => setIsImgHovered(true)}
      onMouseLeave={() => setIsImgHovered(false)}
    >
      <img
        src={isImgHovered || !data.view.descImg ? SMART_MIC : data.view.descImg}
        alt=""
        style={{
          width: 60,
          minWidth: 60,
          height: 60,
          borderRadius: "50%",
          marginRight: 12,
          objectFit: "cover",
          backgroundColor:
            isImgHovered || !data.view.descImg ? "#a9adb0" : "transparent",
        }}
      />
      <div>
        <div style={{ fontWeight: "bold", fontSize: 20 }}>
          {data.view.pageName}
        </div>
        <div style={{ fontSize: 16, overflowY: "auto" }}>{desc}</div>
        {isLoading && (
          <div style={{ fontSize: 14, color: "#a9adb0" }}>Loading audio...</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
    </div>
  );
}
