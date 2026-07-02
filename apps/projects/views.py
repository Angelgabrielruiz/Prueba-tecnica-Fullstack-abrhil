from django.db import transaction
from rest_framework import viewsets, permissions
from rest_framework.response import Response

from apps.projects.models import ProjectMember, Project
from apps.projects.permissions import IsProjectMember
from apps.projects.serializers import ProjectSerializer, ProjectWriteSerializer


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

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            project = write_serializer.save(created_by=request.user)
            ProjectMember.objects.create(
                project=project, user=request.user, role="admin"
            )

        read_serializer = ProjectSerializer(project, context=self.get_serializer_context())
        return Response(read_serializer.data, status=201)