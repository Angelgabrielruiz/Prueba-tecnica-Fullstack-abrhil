import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { listProjects } from "../api/projects";
import { useAuth } from "../auth/useAuth";
import { colorForId } from "../theme/tokens";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { ProjectsIcon } from "./icons";

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo />
          <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em", color: "#00318B" }}>
            abrhil
          </div>
        </div>

        <div style={{ padding: "0 14px" }}>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              "sidebar-nav-btn" + (isActive ? " active" : "")
            }
          >
            <ProjectsIcon />
            Proyectos
          </NavLink>
        </div>

        <div className="sidebar-section-label">TUS PROYECTOS</div>
        <div className="sidebar-projects">
          {projects?.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className={
                "sidebar-project-btn" +
                (String(p.id) === projectId ? " active" : "")
              }
            >
              <span className="dot" style={{ background: colorForId(p.id) }} />
              <span className="label">{p.title}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          {user && <Avatar id={user.id} name={user.name} size={32} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name}
            </div>
            <button
              onClick={() => {
                logout();
                navigate("/auth");
              }}
              style={{
                border: "none",
                background: "none",
                padding: 0,
                fontSize: 12,
                color: "var(--logout)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
