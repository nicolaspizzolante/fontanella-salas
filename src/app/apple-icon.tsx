import { ImageResponse } from "next/og";
import { TRAZO_SF } from "@/front/componentes/marca";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** El mismo monograma del favicon, a 180 px y sin esquinas redondeadas (iOS las aplica). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#171717" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d={TRAZO_SF} fill="#ededed" />
        </svg>
      </div>
    ),
    size,
  );
}
