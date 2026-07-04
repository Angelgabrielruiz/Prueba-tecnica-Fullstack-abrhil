import logoImg from "../assets/logo.jpeg";

interface LogoProps {
  size?: number;
}

export function Logo({ size = 32 }: LogoProps) {
  return (
    <img
      src={logoImg}
      alt="abrhil"
      width={size}
      height={size}
      style={{ flexShrink: 0, borderRadius: "50%", objectFit: "cover" }}
    />
  );
}
