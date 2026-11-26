import logging
import re
import runpy
import sys
from typing import Optional

project_root = "/home/ubuntu/.hermes/hermes-agent"
if project_root not in sys.path:
    sys.path.insert(0, project_root)

print("[Custom Hacks] Injecting Discord logic...")

import os
adapter_path = os.path.join(project_root, "plugins/platforms/discord/adapter.py")
try:
    with open(adapter_path, 'r') as f:
        content = f.read()
    
    # 1. Backfill fix for auto-threads
    t1 = "if (_has_mention_gap or is_thread or _is_reply) and auto_threaded_channel is None:"
    r1 = "if (_has_mention_gap or is_thread or _is_reply):"
    content = content.replace(t1, r1)
    
    # 2. Disable cache usage for backfill so it doesn't stop scanning at last response
    t2 = "after=_after_obj,"
    r2 = "after=None,"
    content = content.replace(t2, r2)
    
    # 3. Disable self-message cutoff completely
    t3 = "if msg.author == self._client.user:\n                    break"
    r3 = "if False: # msg.author == self._client.user:\n                    break"
    content = content.replace(t3, r3)

    with open(adapter_path, 'w') as f:
        f.write(content)
    print("[Custom Hacks] Dynamically patched adapter.py for extended auto-thread backfill")
except Exception as e:
    print(f"[Custom Hacks] Failed to patch adapter.py: {e}")



def _prefix_message_content(message, injection: str):
    original = getattr(message, "content", "") or ""
    new_content = f"{injection}\n\n{original}" if original else injection

    try:
        message.content = new_content
        return message
    except Exception:
        pass

    class MessageProxy:
        def __init__(self, msg, updated_content: str):
            self._msg = msg
            self.content = updated_content

        def __getattr__(self, name):
            return getattr(self._msg, name)

    return MessageProxy(message, new_content)


try:
    import discord
    from plugins.platforms.discord.adapter import DiscordAdapter

    logger = logging.getLogger("custom_hacks.discord")
    _DISCORD_MESSAGE_URL_RE = re.compile(
        r"https://discord\.com/channels/(?P<guild_id>\d+)/(?P<channel_id>\d+)/(?P<message_id>\d+)"
    )

    original_setup = DiscordAdapter._register_slash_commands

    def patched_setup(self):
        original_setup(self)
        if not hasattr(self, "_client") or not self._client:
            return

        tree = self._client.tree

        @tree.command(name="model-global", description="Change the global default model for all new chats")
        @discord.app_commands.describe(name="Model name. Leave empty to use the interactive dropdown menu!")
        async def slash_model_global(interaction: discord.Interaction, name: str = ""):
            await self._run_simple_slash(interaction, f"/model {name} --global".strip())

    DiscordAdapter._register_slash_commands = patched_setup
    print("[Custom Hacks] Injected /model-global", flush=True)

    original_handle = DiscordAdapter._handle_message

    async def _fetch_discord_message(self, channel_id: int, message_id: int):
        target_channel = self._client.get_channel(channel_id)
        if target_channel is None:
            target_channel = await self._client.fetch_channel(channel_id)
        if target_channel is None:
            return None, None
        linked_msg = await target_channel.fetch_message(message_id)
        return target_channel, linked_msg

    def _format_target_message(prefix: str, channel_name: str, linked_msg) -> str:
        linked_author = (
            getattr(linked_msg.author, "display_name", None)
            or getattr(linked_msg.author, "name", None)
            or "unknown"
        )
        linked_content = getattr(linked_msg, "clean_content", None) or getattr(linked_msg, "content", "") or "(no text)"
        return f"[{prefix} in #{channel_name}]\n{linked_author}: {linked_content}"

    async def _build_context_injection(self, message: discord.Message) -> Optional[str]:
        content = getattr(message, "content", "") or ""
        match = _DISCORD_MESSAGE_URL_RE.search(content)
        if match:
            try:
                target_channel, linked_msg = await _fetch_discord_message(
                    self,
                    int(match.group("channel_id")),
                    int(match.group("message_id")),
                )
                if target_channel is None or linked_msg is None:
                    return None

                injection = _format_target_message(
                    "Context from linked Discord message",
                    getattr(target_channel, "name", "unknown"),
                    linked_msg,
                )
                try:
                    surrounding = await self._fetch_channel_context(
                        target_channel,
                        before=linked_msg,
                        reply_target=linked_msg,
                    )
                except Exception:
                    surrounding = ""
                if surrounding:
                    injection = f"{injection}\n\n[Surrounding history]\n{surrounding}"
                logger.info("Injected linked-message context for message_id=%s", linked_msg.id)
                return injection
            except Exception:
                logger.exception("Failed to fetch linked Discord message context")
                return None

        reference = getattr(message, "reference", None)
        ref_message_id = getattr(reference, "message_id", None) if reference is not None else None
        if ref_message_id is not None:
            try:
                target_channel, linked_msg = await _fetch_discord_message(
                    self,
                    int(message.channel.id),
                    int(ref_message_id),
                )
                if target_channel is None or linked_msg is None:
                    return None

                # Let upstream Hermes keep handling surrounding history backfill.
                # This block only makes the exact reply target explicit enough for
                # vague follow-ups like "what do you think?".
                injection = _format_target_message(
                    "Direct reply target",
                    getattr(target_channel, "name", "unknown"),
                    linked_msg,
                )
                logger.info("Injected direct reply-target context for message_id=%s", linked_msg.id)
                return injection
            except Exception:
                logger.exception("Failed to fetch direct reply-target context")
                return None

        return None

    async def patched_handle(self, message: discord.Message, role_authorized: bool = False) -> None:
        injection = await _build_context_injection(self, message)
        if injection:
            message = _prefix_message_content(message, injection)

        await original_handle(self, message, role_authorized=role_authorized)

    DiscordAdapter._handle_message = patched_handle
    print("[Custom Hacks] Injected Discord target-context parser", flush=True)

except Exception as e:
    print(f"[Custom Hacks] Critical failure during monkey-patch: {e}")

print("[Custom Hacks] Handing control to vanilla Hermes...")
sys.argv = ["hermes_cli.main", "gateway", "run"]
runpy.run_module("hermes_cli.main", run_name="__main__")