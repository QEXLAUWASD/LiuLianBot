import random
from typing import Optional

import discord

from command.language_manager import get_translation
from fuction.r6Roll.randommap import random_map
from fuction.r6Roll.randomops import random_operator


def _roll_operator_text(guild_id: Optional[int], choice: str) -> str:
    accessories_list = {
        "scope": [
            f"{get_translation('r6_1xScope', guild_id=guild_id)}",
            f"{get_translation('r6_AcogOrHighScope', guild_id=guild_id)}",
        ],
        "muzzle": [
            f"{get_translation('r6_compensator', guild_id=guild_id)}",
            f"{get_translation('r6_flashHider', guild_id=guild_id)}",
            f"{get_translation('r6_extendedBarrel', guild_id=guild_id)}",
            f"{get_translation('r6_Suppressor', guild_id=guild_id)}",
            f"{get_translation('r6_muzzleBrake', guild_id=guild_id)}",
        ],
        "grip": [
            f"{get_translation('r6_verticalGrip', guild_id=guild_id)}",
            f"{get_translation('r6_angledGrip', guild_id=guild_id)}",
            f"{get_translation('r6_horizontalGrip', guild_id=guild_id)}",
        ],
        "barrel": [f"{get_translation('r6_laserSight', guild_id=guild_id)}"],
    }

    result = random_operator(choice)
    side_label = (
        (get_translation('r6_attack', guild_id=guild_id) or "Attacker")
        if result.get("side") == "Att"
        else (get_translation('r6_defense', guild_id=guild_id) or "Defender")
    )

    primary = result.get("primary", "N/A")
    secondary = result.get("secondary", "N/A")
    gadget = result.get("gadget", "N/A")
    accessories = [random.choice(acc_options) for acc_options in accessories_list.values()]

    return (
        f"**{result.get('name', 'Unknown')}** ({side_label})\n"
        f"{get_translation('r6_Primary_Weapon', guild_id=guild_id)}: {primary}\n"
        f"{get_translation('r6_Secondary_Weapon', guild_id=guild_id)}: {secondary}\n"
        f"{get_translation('r6_Gadget', guild_id=guild_id)}: {gadget}\n"
        f"{get_translation('r6_Accessories', guild_id=guild_id)}: " + ", ".join(accessories)
    )


def _roll_map_text(guild_id: Optional[int]) -> str:
    m = random_map()
    return (
        f"**{m.get('name', 'Unknown')}**\n"
        f"{get_translation('r6_map_game_modes', guild_id=guild_id)}: {random.choice(['Bomb', 'Secure Area', 'Hostage'])}"
    )


class RollButton(discord.ui.Button):
    def __init__(
        self,
        guild_id: Optional[int],
        *,
        label: str,
        choice: str,
        style: discord.ButtonStyle,
        dm_result: bool,
    ):
        super().__init__(label=label, style=style)
        self.guild_id = guild_id
        self.choice = choice
        self.dm_result = dm_result

    async def callback(self, interaction: discord.Interaction):
        guild_id = self.guild_id
        if self.choice in ("Att", "Def"):
            desc = _roll_operator_text(guild_id, self.choice)
        else:
            desc = _roll_map_text(guild_id)

        # If configured to DM results, keep the public message intact.
        if self.dm_result:
            try:
                await interaction.user.send(desc)
                await interaction.response.send_message(
                    get_translation("roller_dm_sent", guild_id) or "✅ I sent you a DM to roll.",
                    ephemeral=True,
                )
            except discord.Forbidden:
                await interaction.response.send_message(
                    get_translation("roller_dm_failed", guild_id)
                    or "❌ I couldn't DM you. Please enable DMs and try again.",
                    ephemeral=True,
                )
            return

        # Default (same channel): keep the roller message intact and
        # show the result only to the clicking user to avoid spamming.
        await interaction.response.send_message(desc, ephemeral=True)


class RollView(discord.ui.View):
    def __init__(self, guild_id: Optional[int], *, dm_result: bool):
        super().__init__(timeout=60)
        op_attack = get_translation('r6_attack', guild_id=guild_id) or "Attacker"
        op_defense = get_translation('r6_defense', guild_id=guild_id) or "Defender"
        map_label = get_translation('r6_Map', guild_id=guild_id) or "Map"

        self.add_item(
            RollButton(guild_id, label=op_attack, choice="Att", style=discord.ButtonStyle.primary, dm_result=dm_result)
        )
        self.add_item(
            RollButton(guild_id, label=op_defense, choice="Def", style=discord.ButtonStyle.danger, dm_result=dm_result)
        )
        self.add_item(
            RollButton(guild_id, label=map_label, choice="Map", style=discord.ButtonStyle.secondary, dm_result=dm_result)
        )


async def send_roller_prompt(channel: discord.abc.Messageable, guild_id: Optional[int], *, dm_result: bool):
    view = RollView(guild_id, dm_result=dm_result)
    prompt = get_translation("roller_prompt", guild_id) or "Select what to roll:"
    await channel.send(content=prompt, view=view)
