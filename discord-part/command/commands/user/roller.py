import discord

from fuction.r6Roll.roller_channel import get_roller_channel, get_roller_dm_result
from command.language_manager import get_translation
from command.roller_service import send_roller_prompt

async def roller(message, bot):
	"""Send buttons to choose what to roll (operator or map) in-channel."""

	guild_id = message.guild.id if message.guild else None
	# If a roller channel is configured for this guild:
	# - restrict usage to that channel
	# - send the UI message in that channel
	# - send roll results via DM when buttons are clicked
	if message.guild:
		roller_channel_id = get_roller_channel(message.guild.id)
		if roller_channel_id:
			if getattr(message.channel, "id", None) != roller_channel_id:
				ch = message.guild.get_channel(roller_channel_id)
				channel_mention = ch.mention if ch else f"#{roller_channel_id}"
				return get_translation("roller_wrong_channel", message.guild.id).replace("{channel}", channel_mention)

			# Post the roller message in the configured channel.
			# The interaction result will be DM'd to the clicking user.
			dm_result = get_roller_dm_result(message.guild.id)
			await send_roller_prompt(message.channel, guild_id, dm_result=dm_result)
			return None

	# Default behavior (no configured channel): send UI in the current channel
	await send_roller_prompt(message.channel, guild_id, dm_result=False)
	return None

