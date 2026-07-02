from rest_framework import serializers

from apps.users.serializers import UserSummarySerializer
from .models import Project, ProjectMember


class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = ProjectMember
        fields = ["id", "user", "role", "joined_at"]


class ProjectSerializer(serializers.ModelSerializer):
    created_by = UserSummarySerializer(read_only=True)
    members = ProjectMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = [
            "id", "title", "description", "status",
            "created_by", "members", "created_at", "updated_at",
        ]


class ProjectWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["title", "description", "status"]