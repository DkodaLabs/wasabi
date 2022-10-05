pragma solidity >=0.4.25 <0.9.0;

library VaultSets {
    enum TokenStatus { FREE, LOCKED }

    struct ERC721Vault {
        TokenStatus status;
        uint256 tokenId;
    }

    struct ERC721Set {
        // All vaults
        ERC721Vault[] vaults;
        // Token id to vault
        mapping(uint256 => uint256) tokenIdToIndices;
        // mapping
    }

    function contains(ERC721Set storage _set, uint256 _tokenId) public view returns(bool) {
        return _set.tokenIdToIndices[_tokenId] > 0;
    }

    function add(ERC721Set storage _set, uint256 _tokenId, TokenStatus _status) external returns(bool) {
        if (contains(_set, _tokenId)) {
            return false;
        }
        _set.vaults.push(ERC721Vault(_status, _tokenId));
        _set.tokenIdToIndices[_tokenId] = _set.vaults.length;
        return true;
    }

    function remove(ERC721Set storage _set, uint256 _tokenId) external returns(bool) {
        uint256 valueIndex = _set.tokenIdToIndices[_tokenId];
        if (valueIndex == 0) {
            return false;
        }
        uint256 toDeleteIndex = valueIndex - 1;
        uint256 lastIndex = _set.vaults.length - 1;

        if (lastIndex != toDeleteIndex) {
            ERC721Vault memory lastValue = _set.vaults[lastIndex];
            // Move the last value to the index where the value to delete is
            _set.vaults[toDeleteIndex] = lastValue;
            // Update the index for the moved value
            _set.tokenIdToIndices[lastValue.tokenId] = valueIndex; // Replace lastValue's index to valueIndex
        }
        // Delete the slot where the moved value was stored
        _set.vaults.pop();
        // Delete the index for the deleted slot
        delete _set.tokenIdToIndices[_tokenId];
        return true;
    }


}