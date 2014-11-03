#!/usr/bin/env bash

cur_path=$(cd "$(dirname "$0")"; pwd)

git clone https://github.com/ecomfe/saber-lang.git ${cur_path}/dep/saber-lang
cd ${cur_path}/dep/saber-lang
git checkout 1.0.0
