from rest_framework import serializers

from apps.users.serializers import UserSummarySerializer
from apps.projects.models import ProjectMember
from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    assignee = UserSummarySerializer(read_only=True)
    created_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id", "project", "assignee", "created_by",
            "title", "description", "status", "priority",
            "due_date", "created_at", "updated_at", "completed_at",
        ]


class TaskWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            "project", "assignee", "title", "description",
            "status", "priority", "due_date",
        ]

    def validate(self, attrs):
        project = attrs.get("project", getattr(self.instance, "project", None))
        assignee = attrs.get("assignee", getattr(self.instance, "assignee", None))

        if assignee is not None and project is not None:
            is_member = ProjectMember.objects.filter(
                project=project, user=assignee
            ).exists()
            if not is_member:
                raise serializers.ValidationError(
                    {"assignee": "El usuario asignado debe ser miembro del proyecto."}
                )

        return attrs