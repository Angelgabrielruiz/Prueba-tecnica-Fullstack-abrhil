import { colorForId } from "../theme/tokens";

interface ProjectIconProps {
  id: number | string;
  name: string;
  size?: number;
}

export function ProjectIcon({ id, name, size = 20 }: ProjectIconProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: colorForId(id),
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: size * 0.55,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}
