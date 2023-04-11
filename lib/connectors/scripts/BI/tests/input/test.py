import unittest
from pathlib import Path
from shutil import rmtree


class CreateNAMEResultTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.object = NAMEResult(
            output_prefix="/tmp/output/requests"
        )

    @classmethod
    def tearDownClass(cls) -> None:
        rmtree("/tmp/output/")

    def test_assets_transformed(self):
        #Add test here to call main function