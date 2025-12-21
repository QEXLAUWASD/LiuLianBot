import discord

from fuction.r6Roll.randomops import random_operator
from fuction.r6Roll.randommap import random_map
import random

async def roller(message, bot):
	"""Send a dropdown to choose what to roll (operator or map)."""

	class RollSelect(discord.ui.Select):
		def __init__(self):
			options = [
				discord.SelectOption(label="Operator", description="Roll a random operator loadout"),
				discord.SelectOption(label="Map", description="Roll a random map and mode"),
			]
			super().__init__(placeholder="Choose what to roll", min_values=1, max_values=1, options=options)

		async def callback(self, interaction: discord.Interaction):
			choice = self.values[0]
			if choice == "Operator":
				class SideSelect(discord.ui.Select):
					def __init__(self):
						super().__init__(
							placeholder="Choose side",
							min_values=1,
							max_values=1,
							options=[
								discord.SelectOption(label="Attacker", value="Att"),
								discord.SelectOption(label="Defender", value="Def"),
							],
						)

					async def callback(self, interaction: discord.Interaction):
						side_choice = self.values[0]
						result = random_operator(side_choice)
						side_label = "Attacker" if result.get("side") == "Att" else "Defender"
						primary = result.get("primary", "N/A")
						secondary = result.get("secondary", "N/A")
						gadget = result.get("gadget", "N/A")
						desc = (
							f"**{result.get('name', 'Unknown')}** ({side_label})\n"
							f"Primary: {primary}\n"
							f"Secondary: {secondary}\n"
							f"Gadget: {gadget}"
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
					f"mode: {random.choice(['Bomb', 'Secure Area', 'Hostage'])}"
				)
				await interaction.response.edit_message(content=desc, view=None)

	class RollView(discord.ui.View):
		def __init__(self):
			super().__init__(timeout=60)
			self.add_item(RollSelect())

	await message.channel.send(content="Select what to roll:", view=RollView())

