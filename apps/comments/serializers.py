from rest_framework import serializers

from apps.users.serializers import UserSummarySerializer
from .models import Comment


class CommentSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "task", "user", "content", "created_at", "updated_at"]


class CommentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ["task", "content"]