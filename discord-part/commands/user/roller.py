import discord

from features.r6_roll.roller_channel import get_roller_channel, get_roller_dm_result
from commands.language_manager import get_translation
from commands.roller_service import send_roller_prompt, roll_operator_text, roll_map_text
from utils.async_io import run_blocking

async def roller(message, bot) -> str | None:
	"""Send buttons to choose what to roll (operator or map) in-channel."""

	guild_id = message.guild.id if message.guild else None

	# Check for direct args (e.g. >roller att)
	parts = message.content.strip().split()
	if len(parts) > 1:
		target = parts[1].lower()
		output = None
		if target in ("att", "atk", "attacker", "attack"):
			output = roll_operator_text(guild_id, "Att")
		elif target in ("def", "defender", "defense"):
			output = roll_operator_text(guild_id, "Def")
		elif target in ("map",):
			output = roll_map_text(guild_id)
		# If user provided a valid direct roll arg, send it immediately
		if output:
			await message.channel.send(output)
			return None

	# If a roller channel is configured for this guild:
	# - restrict usage to that channel
	# - send the UI message in that channel
	# - send roll results via DM when buttons are clicked
	if message.guild:
		roller_channel_id = await run_blocking(get_roller_channel, message.guild.id)
		if roller_channel_id:
			if getattr(message.channel, "id", None) != roller_channel_id:
				ch = message.guild.get_channel(roller_channel_id)
				channel_mention = ch.mention if ch else f"#{roller_channel_id}"
				return get_translation("roller_wrong_channel", message.guild.id).replace("{channel}", channel_mention)

			# Post the roller message in the configured channel.
			# The interaction result will be DM'd to the clicking user.
			dm_result = await run_blocking(get_roller_dm_result, message.guild.id)
			await send_roller_prompt(message.channel, guild_id, dm_result=dm_result)
			return None

	# Default behavior (no configured channel): send UI in the current channel
	await send_roller_prompt(message.channel, guild_id, dm_result=False)
	return None

