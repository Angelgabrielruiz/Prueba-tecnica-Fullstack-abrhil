# apps/activity/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.tasks.models import Task
from apps.activity.models import Activity


@receiver(post_save, sender=Task)
def log_task_activity(sender, instance, created, **kwargs):
    if created:
        Activity.objects.create(
            project=instance.project,
            task=instance,
            user=instance.created_by,
            action="task_created",
            metadata={"title": instance.title},
        )