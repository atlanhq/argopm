import argparse
import glob
import logging
import orjson
import os
import re

from dataclasses import dataclass
from marketplace_scripts.utils import timer, get_value_for_attr
from marketplace_scripts.utils.chunked_output_handler import ChunkedOutputHandler
from sqlitedict import SqliteDict
from typing import List, Dict, Any

parser = argparse.ArgumentParser()


@dataclass
class NAMEScannerResultInputArgs:
    output_prefix: str = "/tmp/NAME"


class NAMEResult:
    def __init__(self, results: SqliteDict, output_prefix: str):
        self.output_prefix = output_prefix
        self.chunk_size = 10000



@timer()
def main():
    args = NAMEScannerResultInputArgs(**vars(parser.parse_args()))
    os.makedirs(args.output_prefix, exist_ok=True)


if __name__ == "__main__":
    main()
