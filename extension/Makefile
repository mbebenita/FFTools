# Copyright 2013 Mozilla Foundation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

BUILD_DIR = ../build/firefox
PROFILE ?= $(error Specify Firefox profile in PROFILE)

# Just builds a FF extension

VERSION = `head -n 1 ../../build/version/version.txt`

build: ensureOutputDirectory
	# Copying extension files
	cp -R content chrome skin chrome.manifest icon.png icon64.png bootstrap.js install.rdf $(BUILD_DIR)/
	# Packaging XPI file
	cd $(BUILD_DIR); zip -r ../FFTools.xpi *
	rm -rf $(BUILD_DIR)

ensureOutputDirectory: clean
	-mkdir -p $(BUILD_DIR)

clean:
	-rm -rf build
	-rm -rf $(BUILD_DIR)

PHONY: build clean ensureOutputDirectory
