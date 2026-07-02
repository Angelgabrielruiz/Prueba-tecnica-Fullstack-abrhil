from rest_framework import permissions

from apps.projects.models import ProjectMember


class IsTaskProjectParticipant(permissions.BasePermission):
    """
    Lectura: cualquier miembro del proyecto de la tarea.
    Creación: cualquier miembro del proyecto (validado en la vista vía queryset/perform_create).
    Edición: assignee, created_by, o admin del proyecto.
    Borrado: solo admin del proyecto.
    """

    def has_object_permission(self, request, view, obj):
        membership = ProjectMember.objects.filter(
            project=obj.project, user=request.user
        ).first()

        if membership is None:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        if request.method == "DELETE":
            return membership.role == "admin"

        # PATCH / PUT: assignee, created_by o admin
        is_owner = obj.assignee_id == request.user.id or obj.created_by_id == request.user.id
        return is_owner or membership.role == "admin"