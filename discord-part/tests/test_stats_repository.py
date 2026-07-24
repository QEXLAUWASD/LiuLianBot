from unittest.mock import MagicMock


def test_stats_repository_records_daily_command_count():
    from features.stats.repository import StatsRepository

    connection = MagicMock()
    repo = StatsRepository(connection_factory=MagicMock(return_value=connection))
    repo.record_command(99)

    connection.cursor.return_value.__enter__.return_value.execute.assert_called_once()
    connection.commit.assert_called_once_with()
