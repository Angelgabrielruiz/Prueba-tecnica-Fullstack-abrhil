from django.db import transaction
from rest_framework import viewsets, permissions

from .models import Project, ProjectMember
from .serializers import ProjectSerializer, ProjectWriteSerializer
from .permissions import IsProjectMember


class ProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsProjectMember]

    def get_queryset(self):
        return (
            Project.objects.filter(members__user=self.request.user)
            .distinct()
            .select_related("created_by")
            .prefetch_related("members__user")
        )

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ProjectWriteSerializer
        return ProjectSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        project = serializer.save(created_by=self.request.user)
        ProjectMember.objects.create(
            project=project, user=self.request.user, role="admin"
        )