import discord
from datetime import datetime
from typing import Optional

from fuction.messagelogger.modify import get_log_channel
from command.language_manager import get_translation
import uilts.logger as log_helper

logger = log_helper.setup_logger(__name__, level=log_helper.logging.INFO)


async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
	"""Log voice channel join/leave/move events to the configured log channel."""
	if member.bot:
		return

	guild: Optional[discord.Guild] = member.guild
	if guild is None:
		return

	# No channel change
	if before.channel == after.channel:
		return

	log_channel_id = get_log_channel(guild.id)
	if not log_channel_id:
		return

	log_channel = guild.get_channel(log_channel_id)
	if not log_channel or not isinstance(log_channel, discord.abc.Messageable):
		return

	# Determine event type
	if before.channel is None and after.channel is not None:
		event_key = "voice_event_joined"
		color = discord.Color.green()
	elif before.channel is not None and after.channel is None:
		event_key = "voice_event_left"
		color = discord.Color.red()
	else:
		event_key = "voice_event_moved"
		color = discord.Color.blue()

	before_label = get_translation("voice_event_no_channel", guild.id)
	after_label = get_translation("voice_event_no_channel", guild.id)
	if isinstance(before.channel, (discord.VoiceChannel, discord.StageChannel)):
		before_label = before.channel.mention
	if isinstance(after.channel, (discord.VoiceChannel, discord.StageChannel)):
		after_label = after.channel.mention

	embed = discord.Embed(
		title=get_translation("voice_event_title", guild.id),
		color=color,
		timestamp=datetime.now()
	)
	embed.set_author(name=member.display_name, icon_url=member.avatar.url if member.avatar else None)
	embed.add_field(name=get_translation("voice_event_action", guild.id), value=get_translation(event_key, guild.id), inline=True)
	embed.add_field(name=get_translation("voice_event_user", guild.id), value=member.mention, inline=True)
	embed.add_field(name=get_translation("voice_event_from", guild.id), value=before_label, inline=False)
	embed.add_field(name=get_translation("voice_event_to", guild.id), value=after_label, inline=False)
	embed.set_footer(text=f"User ID: {member.id}")

	try:
		await log_channel.send(embed=embed)
	except discord.Forbidden:
		logger.warning(f"Missing permission to send voice log to channel {log_channel_id} in guild {guild.id}")
	except Exception as e:
		logger.error(f"Failed to send voice log: {e}")
