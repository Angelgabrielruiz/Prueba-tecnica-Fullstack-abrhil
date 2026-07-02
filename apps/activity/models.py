from django.conf import settings
from django.db import models

from apps.projects.models import Project
from apps.tasks.models import Task


class Activity(models.Model):
    ACTION_CHOICES = [
        ("task_created", "Task Created"),
        ("task_status_changed", "Task Status Changed"),
        ("task_assigned", "Task Assigned"),
        ("comment_added", "Comment Added"),
    ]

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    task = models.ForeignKey(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["project", "-created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} by {self.user} on {self.project}"