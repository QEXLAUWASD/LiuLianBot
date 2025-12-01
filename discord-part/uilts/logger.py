import logging
import colorama
from colorama import Fore, Style
from pathlib import Path
from datetime import datetime

colorama.init(autoreset=True)


class ColoredFormatter(logging.Formatter):
    """Custom formatter with colored output"""
    
    COLORS = {
        'DEBUG': Fore.CYAN,
        'INFO': Fore.GREEN,
        'WARNING': Fore.YELLOW,
        'ERROR': Fore.RED,
        'CRITICAL': Fore.RED + Style.BRIGHT,
    }

    def format(self, record):
        log_color = self.COLORS.get(record.levelname, '')
        # Format timestamp
        timestamp = self.formatTime(record, self.datefmt)
        # Color the level name and message
        colored_levelname = f"{log_color}{record.levelname}{Style.RESET_ALL}"
        colored_msg = f"{log_color}{record.msg}{Style.RESET_ALL}"
        # Return formatted log with timestamp
        return f"{timestamp} - {record.name} - {colored_levelname} - {colored_msg}"


def setup_logger(name: str = __name__, level: int = logging.INFO, log_to_file: bool = True, log_dir: str = 'logs') -> logging.Logger:
    """
    Setup and return a logger with colored output and optional file logging
    
    Args:
        name: Logger name
        level: Logging level (default: logging.INFO)
        log_to_file: Whether to save logs to file (default: True)
        log_dir: Directory to save log files (default: 'logs')
    
    Returns:
        logging.Logger: Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Avoid adding handlers multiple times
    if not logger.handlers:
        # Console handler with colors
        console_handler = logging.StreamHandler()
        colored_formatter = ColoredFormatter(
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(colored_formatter)
        logger.addHandler(console_handler)
        
        # File handler (optional)
        if log_to_file:
            # Create logs directory if it doesn't exist
            log_path = Path(log_dir)
            log_path.mkdir(exist_ok=True)
            
            # Create log file with timestamp
            timestamp = datetime.now().strftime('%Y%m%d')
            log_file = log_path / f'{name.replace(".", "_")}_{timestamp}.log'
            
            file_handler = logging.FileHandler(log_file, encoding='utf-8')
            file_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            file_handler.setFormatter(file_formatter)
            logger.addHandler(file_handler)
    
    return logger