var combinationSum2 = function(candidates, target) {
    let prev = 0;
    let next = 0;
    let result = []
    candidates.sort((a,b) =>(a - b))
    while(next < candidates.length){
       let minCandidates = candidates.slice(prev,next + 1)
       console.log(minCandidates)
       let  presentNum = minCandidates.reduce((sum,current) =>{return sum + current})
        if (presentNum === target){
           result.push(minCandidates)
        }
        else if(presentNum > target){
            prev++
        }
        else(next++)
    }
    return result
};

combinationSum2(candidates = [10,1,2,7,6,1,5], target = 8)