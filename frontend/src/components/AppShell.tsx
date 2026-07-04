import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { listProjects } from "../api/projects";
import { useAuth } from "../auth/useAuth";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { ProjectIcon } from "./ProjectIcon";
import { ChevronLeftIcon, ChevronRightIcon, LogoutIcon, ProjectsIcon } from "./icons";

const COLLAPSE_KEY = "abrhil_sidebar_collapsed";

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          {collapsed ? <ChevronRightIcon size={13} /> : <ChevronLeftIcon size={13} />}
        </button>

        <div className="sidebar-header">
          <Logo />
          {!collapsed && (
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em", color: "#00318B" }}>
              abrhil
            </div>
          )}
        </div>

        <div style={{ padding: "0 14px" }}>
          <NavLink
            to="/"
            end
            title="Proyectos"
            className={({ isActive }) =>
              "sidebar-nav-btn" + (isActive ? " active" : "")
            }
          >
            <ProjectsIcon />
            {!collapsed && "Proyectos"}
          </NavLink>
        </div>

        {!collapsed && <div className="sidebar-section-label">TUS PROYECTOS</div>}
        <div className="sidebar-projects" style={{ marginTop: collapsed ? 10 : 0 }}>
          {projects?.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              title={p.title}
              className={
                "sidebar-project-btn" +
                (String(p.id) === projectId ? " active" : "")
              }
            >
              <ProjectIcon id={p.id} name={p.title} />
              {!collapsed && <span className="label">{p.title}</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          {user && <Avatar id={user.id} name={user.name} size={32} />}
          {!collapsed && (
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
          )}
          {collapsed && (
            <button
              onClick={() => {
                logout();
                navigate("/auth");
              }}
              title="Cerrar sesión"
              style={{
                border: "none",
                background: "none",
                padding: 0,
                color: "var(--logout)",
                cursor: "pointer",
                display: "flex",
              }}
            >
              <LogoutIcon size={16} />
            </button>
          )}
        </div>
      </aside>

      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
