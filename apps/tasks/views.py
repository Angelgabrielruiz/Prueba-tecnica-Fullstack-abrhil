from django.db import transaction
from rest_framework import viewsets, permissions
from rest_framework.response import Response

from apps.tasks.models import Task
from apps.tasks.permissions import IsTaskProjectParticipant
from apps.tasks.serializers import TaskSerializer, TaskWriteSerializer


class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTaskProjectParticipant]

    def get_queryset(self):
        return (
            Task.objects.filter(project__members__user=self.request.user)
            .distinct()
            .select_related("project", "assignee", "created_by")
        )

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return TaskWriteSerializer
        return TaskSerializer

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            task = write_serializer.save(created_by=request.user)

        read_serializer = TaskSerializer(task, context=self.get_serializer_context())
        return Response(read_serializer.data, status=201)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        write_serializer = self.get_serializer(instance, data=request.data, partial=partial)
        write_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            task = write_serializer.save()

        read_serializer = TaskSerializer(task, context=self.get_serializer_context())
        return Response(read_serializer.data)