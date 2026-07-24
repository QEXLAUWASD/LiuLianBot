from unittest.mock import MagicMock


def test_build_balanced_teams_keeps_size_difference_at_most_one():
    from features.events.repository import build_balanced_teams

    alpha, bravo = build_balanced_teams(["A", "B", "C", "D", "E"])

    assert alpha == ["A", "C", "E"]
    assert bravo == ["B", "D"]


def test_link_account_consumes_valid_code_and_links_discord_user():
    from features.events.repository import EventRepository, hash_link_code

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.side_effect = [(7, "web-user"), None]
    repository = EventRepository(connection_factory=MagicMock(return_value=connection))

    result = repository.link_account("ABCD1234", 123456)

    assert result is True
    cursor.execute.assert_any_call(
        "UPDATE website_users SET discord_user_id=%s WHERE id=%s",
        ("123456", "web-user"),
    )
    cursor.execute.assert_any_call(
        "UPDATE website_link_codes SET used_at=NOW() WHERE id=%s", (7,)
    )
    assert len(hash_link_code("ABCD1234")) == 64
    connection.commit.assert_called_once_with()


def test_join_event_requires_a_linked_account():
    from features.events.repository import EventRepository

    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = None
    repository = EventRepository(connection_factory=MagicMock(return_value=connection))

    result = repository.join_event(1, 123456)

    assert result == "not_linked"
    connection.commit.assert_not_called()
    connection.close.assert_called_once_with()
