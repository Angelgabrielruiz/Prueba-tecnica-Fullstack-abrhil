from rest_framework import permissions

from .models import ProjectMember


class IsProjectMember(permissions.BasePermission):
    """
    Permite operaciones de solo lectura a cualquier miembro del proyecto.
    Permite escritura solo a miembros con rol 'admin'.
    """

    def has_object_permission(self, request, view, obj):
        membership = ProjectMember.objects.filter(
            project=obj, user=request.user
        ).first()

        if membership is None:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        return membership.role == "admin"