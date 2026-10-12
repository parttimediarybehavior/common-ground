import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('island_server',Path(__file__).resolve().parents[1]/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)

class PublicBoundary(unittest.TestCase):
    def test_assets_available(self):
        self.assertEqual(server.public_file('/')[0].name,'index.html')
        self.assertEqual(server.public_file('/engine.js?fresh=1')[0].name,'engine.js')
        self.assertTrue(server.public_file('/save.js')[0].is_file())
        self.assertTrue(server.public_file('/standalone.html')[0].is_file())
        self.assertTrue(server.public_file('/casebook-standalone.html')[0].is_file())
    def test_private_paths_and_traversal_are_not_served(self):
        for path in ['/runner/state.json','/CHECKPOINT.md','/../.env','/%2e%2e/.env','//engine.js','/engine.js/anything','/server.py','/']:
            if path!='/': self.assertIsNone(server.public_file(path),path)

if __name__=='__main__':unittest.main()
