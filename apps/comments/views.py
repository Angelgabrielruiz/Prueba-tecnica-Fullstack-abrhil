from django.db import transaction
from rest_framework import viewsets, permissions
from rest_framework.response import Response

from apps.comments.models import Comment
from apps.comments.permissions import IsCommentProjectParticipant
from apps.comments.serializers import CommentSerializer, CommentWriteSerializer


class CommentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsCommentProjectParticipant]

    def get_queryset(self):
        return (
            Comment.objects.filter(task__project__members__user=self.request.user)
            .distinct()
            .select_related("task", "user")
        )

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return CommentWriteSerializer
        return CommentSerializer

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            comment = write_serializer.save(user=request.user)

        read_serializer = CommentSerializer(comment, context=self.get_serializer_context())
        return Response(read_serializer.data, status=201)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        write_serializer = self.get_serializer(instance, data=request.data, partial=partial)
        write_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            comment = write_serializer.save()

        read_serializer = CommentSerializer(comment, context=self.get_serializer_context())
        return Response(read_serializer.data)