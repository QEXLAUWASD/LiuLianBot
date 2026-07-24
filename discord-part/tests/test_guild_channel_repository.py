from unittest.mock import MagicMock


def test_channel_repository_replaces_one_guilds_text_channels():
    from features.guild_channels.repository import GuildChannelRepository

    connection = MagicMock()
    repository = GuildChannelRepository(connection_factory=MagicMock(return_value=connection))
    repository.replace_for_guild(1, [(11, "general"), (12, "announcements")])

    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.execute.assert_any_call("DELETE FROM discord_guild_channels WHERE guild_id=%s", (1,))
    cursor.executemany.assert_called_once()
    connection.commit.assert_called_once_with()
