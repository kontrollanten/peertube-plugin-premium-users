#!/bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
set -e

__cleanup ()
{
    echo "Failed to run script, will run a cleanup. Try again."
    cd $SCRIPT_DIR
    sudo docker compose logs --tail 20
    sudo docker compose down
}

trap __cleanup INT
trap __cleanup EXIT

npm i
cd ..
echo "Packing plugin..."
npm pack --pack-destination tests
cd tests
rm -rf peertube-plugin-premium-users
mkdir peertube-plugin-premium-users
tar xvf peertube-plugin-premium-users-*.tgz -C peertube-plugin-premium-users --strip-components=1
rm peertube-plugin-premium-users-*.tgz
sudo docker compose up -d --wait
sudo docker compose exec peertube npm install -g @peertube/peertube-cli
PEERTUBE_PWD=rootroot
sudo docker compose exec peertube peertube-cli auth add -u "http://localhost:9000" -U "root" --password "$PEERTUBE_PWD"
sudo docker compose exec peertube peertube-cli plugins install --path /peertube-plugin-premium-users
sudo docker compose exec peertube peertube-cli get-access-token --url http://localhost:9000 --username root --password $PEERTUBE_PWD > .peertube_access_token
source $HOME/.nvm/nvm.sh; nvm use
npx ts-node prepare-plugin
