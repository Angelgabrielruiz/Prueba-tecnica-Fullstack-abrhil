from rest_framework import permissions

from apps.projects.models import ProjectMember


class IsCommentProjectParticipant(permissions.BasePermission):
    """
    Lectura: cualquier miembro del proyecto de la tarea comentada.
    Creación: cualquier miembro del proyecto (implícito, validado en el queryset).
    Edición/borrado: solo el autor del comentario.
    """

    def has_object_permission(self, request, view, obj):
        membership = ProjectMember.objects.filter(
            project=obj.task.project, user=request.user
        ).first()

        if membership is None:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        return obj.user_id == request.user.id