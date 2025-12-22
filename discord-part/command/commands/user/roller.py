import discord

from fuction.r6Roll.randomops import random_operator
from fuction.r6Roll.randommap import random_map
from command.language_manager import get_translation
import random

async def roller(message, bot):
	"""Send a dropdown to choose what to roll (operator or map)."""

	class RollSelect(discord.ui.Select):
		def __init__(self):
			guild_id = message.guild.id if message.guild else None
			options = [
				discord.SelectOption(label="Operator", description=f"{get_translation('r6_operator_desc', guild_id=guild_id)}"),
				discord.SelectOption(label="Map", description=f"{get_translation('r6_map_desc', guild_id=guild_id)}"),
			]
			super().__init__(placeholder="Choose what to roll", min_values=1, max_values=1, options=options)

		async def callback(self, interaction: discord.Interaction):
			guild_id = message.guild.id if message.guild else None
			choice = self.values[0]
			if choice == "Operator":
				class SideSelect(discord.ui.Select):
					def __init__(self):
						super().__init__(
							placeholder="Choose side",
							min_values=1,
							max_values=1,
							options=[
								discord.SelectOption(label=f"{get_translation('r6_attack', guild_id=guild_id)}", value="Att"),
								discord.SelectOption(label=f"{get_translation('r6_defense', guild_id=guild_id)}", value="Def"),
							],
						)

					async def callback(self, interaction: discord.Interaction):
						AccessoriesList = {
							"scope" :[f'{get_translation("r6_1xScope", guild_id=guild_id)}', f'{get_translation("r6_AcogOrHighScope", guild_id=guild_id)}'],
							"muzzle" :[f'{get_translation("r6_compensator", guild_id=guild_id)}', f'{get_translation("r6_flashHider", guild_id=guild_id)}', f'{get_translation("r6_extendedBarrel", guild_id=guild_id)}', f'{get_translation("r6_Suppressor", guild_id=guild_id)}', f'{get_translation("r6_muzzleBrake", guild_id=guild_id)}'],
							"grip" :[f'{get_translation("r6_verticalGrip", guild_id=guild_id)}', f'{get_translation("r6_angledGrip", guild_id=guild_id)}', f'{get_translation("r6_horizontalGrip", guild_id=guild_id)}'],
							"barrel" :[f'{get_translation("r6_laserSight", guild_id=guild_id)}'],
						}
						side_choice = self.values[0]
						result = random_operator(side_choice)
						side_label = "Attacker" if result.get("side") == "Att" else "Defender"
						primary = result.get("primary", "N/A")
						secondary = result.get("secondary", "N/A")
						gadget = result.get("gadget", "N/A")
						accessories = []
						# Randomly add accessories for primary weapon
						for acc_type, acc_options in AccessoriesList.items():
							accessories.append(random.choice(acc_options))
						desc = (
							f"**{result.get('name', 'Unknown')}** ({side_label})\n"
							f"{get_translation('r6_Primary_Weapon', guild_id=guild_id)}: {primary}\n"
							f"{get_translation('r6_Secondary_Weapon', guild_id=guild_id)}: {secondary}\n"
							f"{get_translation('r6_Gadget', guild_id=guild_id)}: {gadget}\n"
							f"{get_translation('r6_Accessories', guild_id=guild_id)}: " + ", ".join(accessories)
						)
						await interaction.response.edit_message(content=desc, view=None)

				class SideView(discord.ui.View):
					def __init__(self):
						super().__init__(timeout=60)
						self.add_item(SideSelect())

				await interaction.response.edit_message(content="Select side to roll:", view=SideView())
			else:
				m = random_map()
				playlists = ", ".join(m.get("playlists", [])) or "N/A"
				mode = m.get("playlist", "N/A")
				desc = (
					f"**{m.get('name', 'Unknown')}**\n"
					f"{get_translation('r6_map_game_modes', guild_id=guild_id)}: {random.choice(['Bomb', 'Secure Area', 'Hostage'])}"
				)
				await interaction.response.edit_message(content=desc, view=None)

	class RollView(discord.ui.View):
		def __init__(self):
			super().__init__(timeout=60)
			self.add_item(RollSelect())

	await message.channel.send(content="Select what to roll:", view=RollView())

